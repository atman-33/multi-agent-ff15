import { getProjectRoot } from "@/lib/get-project-root.server";
import { isWorkerAgentId } from "@/lib/agent-identity";
import {
  recordDirectedReportReturn,
  recordDirectedTaskDelegation,
} from "@/lib/banter/conversation-service";
import { resolveMissionExecutionRoot } from "@/lib/mission-execution-workspace.server";
import {
  appendMissionActivity,
  appendMissionMessage,
  clearMissionSessions,
  getMission,
  setMissionPrimarySession,
  setWorkerSession,
  updateMissionExecutionContext,
} from "@/lib/mission-store";
import { getManagedSessionTitle } from "@/lib/managed-session-titles";
import { updateTmuxDispatchItemRecordLinks } from "@/lib/mission-primary-agent-outbox.server";
import { splitModelSelection } from "@/lib/model-variant-selection";
import { getOpencodeClient } from "@/lib/opencode-client";
import { getOperationState } from "@/lib/operation-runtime/state";
import { composeTeamMessagePrompt } from "@/lib/prompt-composition-engine";
import { queueTmuxAgentDispatch } from "@/lib/primary-agent-outbox-dispatch.server";
import { resolveTmuxWriteTarget } from "@/lib/session-owner-routing.server";
import { getActivityActorLabel } from "@/lib/team-message-format";
import type {
  ActivityActorId,
  AgentId,
  MissionActivityKind,
  MissionMessageLogEntry,
  ReportStatus,
  TeamMessage,
  TeamMessageType,
  WorkflowNext,
} from "@/lib/types/mission";

export interface SendTeamMessageInput {
  missionId: string;
  fromAgent: AgentId;
  toAgent: AgentId;
  type: TeamMessageType;
  body: string;
  details?: string;
  taskId?: string;
  next?: WorkflowNext;
  reportStatus?: ReportStatus;
  artifacts?: string[];
  activityActor?: ActivityActorId;
  activitySpeaker?: ActivityActorId;
  activityKind?: MissionActivityKind;
  workflowGuidance?: string;
}

function createMessageId(): string {
  return `msg_${crypto.randomUUID()}`;
}

function assertHubSafe(fromAgent: AgentId, toAgent: AgentId): void {
  if (fromAgent !== "noctis" && toAgent !== "noctis") {
    throw new Error("Worker-to-worker team messaging is not allowed in MVP");
  }
}

/**
 * Validate simple protocol contract:
 * - task: Noctis -> worker only
 * - message: one-way supplemental message
 * - report: worker -> Noctis only, MUST include taskId and next
 */
function assertIntentContract(message: SendTeamMessageInput): void {
  if (message.type === "task" && message.fromAgent !== "noctis") {
    throw new Error("Task messages must originate from Noctis");
  }

  if (message.type === "message" && message.fromAgent !== "noctis") {
    throw new Error("Only Noctis can send plain team messages in the simple protocol");
  }

  if (message.type === "report") {
    if (!message.taskId) {
      throw new Error("Report messages must include taskId");
    }
    if (!message.next) {
      throw new Error("Report messages must include next");
    }
    if (message.toAgent !== "noctis") {
      throw new Error("Report messages must target Noctis");
    }
  }
}

function serializeMeta(message: TeamMessage, displayFrom: ActivityActorId): string {
  return [
    "[TEAM MESSAGE META]",
    `message_id: ${message.id}`,
    `mission_id: ${message.missionId}`,
    `from_agent: ${message.fromAgent}`,
    `to_agent: ${message.toAgent}`,
    `message_type: ${message.type}`,
    `task_id: ${message.taskId ?? ""}`,
    `next: ${message.next ?? ""}`,
    `report_status: ${message.reportStatus ?? ""}`,
    `display_from: ${getActivityActorLabel(displayFrom)}`,
    `display_to: ${getActivityActorLabel(message.toAgent)}`,
    `artifacts: ${JSON.stringify(message.artifacts ?? [])}`,
  ].join("\n");
}

async function resolveTargetSession(missionId: string, toAgent: AgentId): Promise<{
  client: ReturnType<typeof getOpencodeClient>;
  mode: "direct" | "tmux";
  sessionId: string;
  sessionTitle: string;
}> {
  const mission = getMission(missionId);
  if (!mission) {
    throw new Error("Mission not found");
  }

  if (!mission.executionProjectId) {
    throw new Error("Mission requires an execution workspace before team messages can be delivered.");
  }

  const projectRoot = getProjectRoot();
  const executionRoot = resolveMissionExecutionRoot({
    appRoot: projectRoot,
    mission,
  });
  if (executionRoot.workspacePath && executionRoot.workspaceStatus) {
    updateMissionExecutionContext(missionId, {
      workspacePath: executionRoot.workspacePath,
      workspaceStatus: executionRoot.workspaceStatus,
    });
  }

  if (executionRoot.recreated) {
    clearMissionSessions(missionId);
  }

  if (mission.transportMode === "tmux-resident") {
    const writeTarget = await resolveTmuxWriteTarget({
      missionId,
      agentId: toAgent,
      sessionHostRoot: executionRoot.sessionHostRoot,
    });
    return {
      client: writeTarget.client,
      mode: "tmux",
      sessionId: writeTarget.sessionId,
      sessionTitle: writeTarget.sessionTitle,
    };
  }

  const client = getOpencodeClient();

  if (!isWorkerAgentId(toAgent)) {
    const existingPrimarySessionId = mission.primarySessionId || mission.noctisSessionId;
    if (existingPrimarySessionId) {
      return {
        client,
        mode: "direct",
        sessionId: existingPrimarySessionId,
        sessionTitle: getManagedSessionTitle(missionId, toAgent),
      };
    }

    const sessionResult = await client.session.create({
      directory: executionRoot.sessionHostRoot,
      title: getManagedSessionTitle(missionId, toAgent),
    });

    const sessionId = sessionResult.data?.id;
    if (!sessionId) {
      throw new Error("Session creation returned no ID");
    }

    setMissionPrimarySession(missionId, toAgent, sessionId);
    return {
      client,
      mode: "direct",
      sessionId,
      sessionTitle: getManagedSessionTitle(missionId, toAgent),
    };
  }

  const existingWorkerSessionId = mission.workerSessions[toAgent];
  if (existingWorkerSessionId) {
    return {
      client,
      mode: "direct",
      sessionId: existingWorkerSessionId,
      sessionTitle: getManagedSessionTitle(missionId, toAgent),
    };
  }

  const sessionResult = await client.session.create({
    directory: executionRoot.sessionHostRoot,
    title: getManagedSessionTitle(missionId, toAgent),
  });

  const sessionId = sessionResult.data?.id;
  if (!sessionId) {
    throw new Error("Session creation returned no ID");
  }

  setWorkerSession(missionId, toAgent, sessionId);
  return {
    client,
    mode: "direct",
    sessionId,
    sessionTitle: getManagedSessionTitle(missionId, toAgent),
  };
}

async function deliverMissionMessage(
  input: SendTeamMessageInput
): Promise<{
  sessionId: string;
  messageId: string;
  createdAt: string;
  deliveryStatus: "queued" | "sent";
  outboxItemId?: string;
}> {
  assertHubSafe(input.fromAgent, input.toAgent);
  assertIntentContract(input);

  const mission = getMission(input.missionId);
  if (!mission) {
    throw new Error("Mission not found");
  }

  const message: TeamMessage = {
    id: createMessageId(),
    missionId: input.missionId,
    fromAgent: input.fromAgent,
    toAgent: input.toAgent,
    type: input.type,
    body: input.body,
    taskId: input.taskId,
    next: input.next,
    reportStatus: input.reportStatus,
    artifacts: input.artifacts,
    createdAt: new Date().toISOString(),
  };

  const target = await resolveTargetSession(input.missionId, input.toAgent);
  const sessionId = target.sessionId;
  const projectRoot = getProjectRoot();

  const system = serializeMeta(message, input.activitySpeaker ?? input.fromAgent);
  const composed = composeTeamMessagePrompt({
    context: {
      missionId: input.missionId,
      sessionId,
      agent: input.toAgent,
      appRoot: projectRoot,
    },
    missionId: input.missionId,
    from: input.activitySpeaker ?? input.fromAgent,
    to: input.toAgent,
    type: input.type,
    body: input.body,
    taskId: input.taskId,
    next: input.next,
    reportStatus: input.reportStatus,
    artifacts: input.artifacts,
    details: input.details,
    operationStateOverride: getOperationState(input.missionId),
    workflowExtensionOverride: input.workflowGuidance,
  });

  const { model, variant } = splitModelSelection(mission.agentModels[input.toAgent]);

  if (target.mode === "tmux") {
    const queuedEntry: MissionMessageLogEntry = {
      ...message,
      deliveredToSessionId: sessionId,
      deliveryStatus: "queued",
    };
    appendMissionMessage(input.missionId, queuedEntry);
    appendMissionActivity(input.missionId, {
      id: `activity_${message.id}`,
      actor: input.activityActor ?? input.fromAgent,
      speaker: input.activitySpeaker ?? input.fromAgent,
      kind: input.activityKind ?? "team_message",
      body: input.body,
      createdAt: message.createdAt,
      source: {
        type: "team_message",
        sessionId,
        messageId: message.id,
        taskId: message.taskId,
        next: message.next,
        reportStatus: message.reportStatus,
        deliveryStatus: "queued",
      },
    });

    const queuedItem = queueTmuxAgentDispatch({
      missionId: input.missionId,
      agent: input.toAgent,
      sessionId,
      sessionTitle: target.sessionTitle,
      parts: composed.payloadParts,
      system,
      ...(model ? { model } : {}),
      ...(variant ? { variant } : {}),
      activityBody: "Queued tmux team-message delivery.",
    });

    return {
      createdAt: message.createdAt,
      deliveryStatus: "queued",
      messageId: message.id,
      outboxItemId: queuedItem.id,
      sessionId,
    };
  }

  try {
    const _result = await target.client.session.promptAsync({
      sessionID: sessionId,
      parts: composed.payloadParts,
      agent: input.toAgent,
      system,
      ...(model ? { model } : {}),
      ...(variant ? { variant } : {}),
    });

    const entry: MissionMessageLogEntry = {
      ...message,
      deliveredToSessionId: sessionId,
      deliveryStatus: "sent",
    };
    appendMissionMessage(input.missionId, entry);
    appendMissionActivity(input.missionId, {
      id: `activity_${message.id}`,
      actor: input.activityActor ?? input.fromAgent,
      speaker: input.activitySpeaker ?? input.fromAgent,
      kind: input.activityKind ?? "team_message",
      body: input.body,
      createdAt: message.createdAt,
      source: {
        type: "team_message",
        sessionId,
        messageId: message.id,
        taskId: message.taskId,
        next: message.next,
        reportStatus: message.reportStatus,
        deliveryStatus: "sent",
      },
    });
    return {
      createdAt: message.createdAt,
      deliveryStatus: "sent",
      messageId: message.id,
      sessionId,
    };
  } catch (error) {
    const failedEntry: MissionMessageLogEntry = {
      ...message,
      deliveredToSessionId: sessionId,
      deliveryStatus: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
    appendMissionMessage(input.missionId, failedEntry);
    throw error;
  }
}

export async function sendSimpleMessage(input: {
  missionId: string;
  toAgent: AgentId;
  body: string;
  fromActor: ActivityActorId;
}): Promise<{ sessionId: string; messageId: string }> {
  const delivery = await deliverMissionMessage({
    missionId: input.missionId,
    fromAgent: "noctis",
    toAgent: input.toAgent,
    type: "message",
    body: input.body,
    activityActor: input.fromActor,
    activitySpeaker: input.fromActor,
    activityKind: "team_message",
  });

  const banterEntries = recordDirectedTaskDelegation({
    missionId: input.missionId,
    fromAgent: "noctis",
    toAgent: input.toAgent,
    orchestratedBy: "noctis",
    canonicalMessage: input.body,
    createdAt: delivery.createdAt,
    ...((delivery.deliveryStatus === "sent" || delivery.deliveryStatus === "queued")
      ? {
          transport: {
            deliveredToSessionId: delivery.sessionId,
            deliveryStatus: delivery.deliveryStatus,
            sessionId: delivery.sessionId,
          },
        }
      : {}),
  });

  if (delivery.deliveryStatus === "queued" && delivery.outboxItemId) {
    updateTmuxDispatchItemRecordLinks({
      missionId: input.missionId,
      itemId: delivery.outboxItemId,
      recordLinks: {
        activityEntryId: `activity_${delivery.messageId}`,
        conversationEntryIds: banterEntries.map((entry) => entry.id),
        messageLogEntryId: delivery.messageId,
      },
    });
  }

  return delivery;
}

export async function sendWorkerReport(input: {
  missionId: string;
  fromAgent: AgentId;
  taskId: string;
  next: WorkflowNext;
  message: string;
  reportStatus?: ReportStatus;
  artifacts?: string[];
  workflowGuidance?: string;
}): Promise<{ sessionId: string; messageId: string }> {
  const delivery = await deliverMissionMessage({
    missionId: input.missionId,
    fromAgent: input.fromAgent,
    toAgent: "noctis",
    type: "report",
    body: input.message,
    taskId: input.taskId,
    next: input.next,
    reportStatus: input.reportStatus,
    artifacts: input.artifacts,
    activityActor: input.fromAgent,
    activitySpeaker: input.fromAgent,
    activityKind: "team_message",
    workflowGuidance: input.workflowGuidance,
  });

  const banterEntries = recordDirectedReportReturn({
    missionId: input.missionId,
    fromAgent: input.fromAgent,
    toAgent: "noctis",
    orchestratedBy: "noctis",
    taskId: input.taskId,
    next: input.next,
    reportStatus: input.reportStatus ?? "completed",
    reportBody: input.message,
    createdAt: delivery.createdAt,
    ...((delivery.deliveryStatus === "sent" || delivery.deliveryStatus === "queued")
      ? {
          transport: {
            deliveredToSessionId: delivery.sessionId,
            deliveryStatus: delivery.deliveryStatus,
            sessionId: delivery.sessionId,
          },
        }
      : {}),
  });

  if (delivery.deliveryStatus === "queued" && delivery.outboxItemId) {
    updateTmuxDispatchItemRecordLinks({
      missionId: input.missionId,
      itemId: delivery.outboxItemId,
      recordLinks: {
        activityEntryId: `activity_${delivery.messageId}`,
        conversationEntryIds: banterEntries.map((entry) => entry.id),
        messageLogEntryId: delivery.messageId,
      },
    });
  }

  return delivery;
}
