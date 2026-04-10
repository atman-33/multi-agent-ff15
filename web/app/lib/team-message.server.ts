import { getProjectRoot } from "@/lib/get-project-root.server";
import { ensureMissionExecutionWorkspace } from "@/lib/mission-execution-workspace.server";
import {
  appendMissionActivity,
  appendMissionMessage,
  clearMissionSessions,
  getMission,
  setNoctisSession,
  setWorkerSession,
  updateMissionExecutionContext,
} from "@/lib/mission-store";
import { splitModelSelection } from "@/lib/model-variant-selection";
import { getOpencodeClient } from "@/lib/opencode-client";
import { getOperationState } from "@/lib/operation-runtime/state";
import { composeTeamMessagePrompt } from "@/lib/prompt-composition-engine";
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

async function resolveTargetSession(missionId: string, toAgent: AgentId): Promise<string> {
  const mission = getMission(missionId);
  if (!mission) {
    throw new Error("Mission not found");
  }

  if (!mission.executionProjectId || !mission.branch || !mission.workspacePath) {
    throw new Error("Mission requires an execution workspace before team messages can be delivered.");
  }

  const executionWorkspace = ensureMissionExecutionWorkspace({
    appRoot: getProjectRoot(),
    executionProjectId: mission.executionProjectId,
    branch: mission.branch,
    workspacePath: mission.workspacePath,
  });
  updateMissionExecutionContext(missionId, {
    workspacePath: executionWorkspace.workspacePath,
    workspaceStatus: executionWorkspace.workspaceStatus,
  });

  if (executionWorkspace.recreated) {
    clearMissionSessions(missionId);
  }

  const client = getOpencodeClient();

  if (toAgent === "noctis") {
    if (mission.noctisSessionId) {
      return mission.noctisSessionId;
    }

    const sessionResult = await client.session.create({
      directory: executionWorkspace.workspacePath,
      title: `mission:${missionId}`,
    });

    const sessionId = sessionResult.data?.id;
    if (!sessionId) {
      throw new Error("Session creation returned no ID");
    }

    setNoctisSession(missionId, sessionId);
    return sessionId;
  }

  const existing = mission.workerSessions[toAgent];
  if (existing) {
    return existing;
  }

  const sessionResult = await client.session.create({
    directory: executionWorkspace.workspacePath,
    title: `mission:${missionId}:${toAgent}`,
  });

  const sessionId = sessionResult.data?.id;
  if (!sessionId) {
    throw new Error("Session creation returned no ID");
  }

  setWorkerSession(missionId, toAgent, sessionId);
  return sessionId;
}

async function deliverMissionMessage(
  input: SendTeamMessageInput
): Promise<{ sessionId: string; messageId: string }> {
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

  const sessionId = await resolveTargetSession(input.missionId, input.toAgent);
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

  const client = getOpencodeClient();
  const { model, variant } = splitModelSelection(mission.agentModels[input.toAgent]);

  try {
    const _result = await client.session.promptAsync({
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
    return { sessionId, messageId: message.id };
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
  return deliverMissionMessage({
    missionId: input.missionId,
    fromAgent: "noctis",
    toAgent: input.toAgent,
    type: "message",
    body: input.body,
    activityActor: input.fromActor,
    activitySpeaker: input.fromActor,
    activityKind: "team_message",
  });
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
  return deliverMissionMessage({
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
}
