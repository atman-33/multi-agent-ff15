import { getOpencodeClient } from "@/lib/opencode-client";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { buildInjectedPromptContext } from "@/lib/prompt-context.server";
import { appendMissionMessage, getMission, setWorkerSession } from "@/lib/mission-store";
import type {
  AgentId,
  MissionMessageLogEntry,
  ReportStatus,
  TeamMessage,
  TeamMessageType,
} from "@/lib/types/mission";

export interface SendTeamMessageInput {
  missionId: string;
  fromAgent: AgentId;
  toAgent: AgentId;
  type: TeamMessageType;
  body: string;
  taskId?: string;
  reportStatus?: ReportStatus;
  artifacts?: string[];
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
 * - report: worker -> Noctis only, MUST include taskId and reportStatus
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
    if (!message.reportStatus) {
      throw new Error("Report messages must include reportStatus");
    }
    if (message.toAgent !== "noctis") {
      throw new Error("Report messages must target Noctis");
    }
  }
}

function serializeMeta(message: TeamMessage): string {
  return [
    "[TEAM MESSAGE META]",
    `message_id: ${message.id}`,
    `mission_id: ${message.missionId}`,
    `from_agent: ${message.fromAgent}`,
    `to_agent: ${message.toAgent}`,
    `message_type: ${message.type}`,
    `task_id: ${message.taskId ?? ""}`,
    `report_status: ${message.reportStatus ?? ""}`,
    `artifacts: ${JSON.stringify(message.artifacts ?? [])}`,
  ].join("\n");
}

async function resolveTargetSession(missionId: string, toAgent: AgentId): Promise<string> {
  const mission = getMission(missionId);
  if (!mission) {
    throw new Error("Mission not found");
  }

  if (toAgent === "noctis") {
    return mission.noctisSessionId;
  }

  const existing = mission.workerSessions[toAgent];
  if (existing) {
    return existing;
  }

  const client = getOpencodeClient();
  const projectRoot = getProjectRoot();
  const sessionResult = await client.session.create({
    query: { directory: projectRoot },
    body: { title: `mission:${missionId}:${toAgent}` },
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
    reportStatus: input.reportStatus,
    artifacts: input.artifacts,
    createdAt: new Date().toISOString(),
  };

  const sessionId = await resolveTargetSession(input.missionId, input.toAgent);
  const projectRoot = getProjectRoot();
  const injectedContext = buildInjectedPromptContext({
    missionId: input.missionId,
    sessionId,
    agent: input.toAgent,
    appRoot: projectRoot,
  });

  const system = serializeMeta(message);
  const client = getOpencodeClient();

  try {
    const result = await client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: [
          { type: "text", text: injectedContext },
          { type: "text", text: input.body },
        ],
        agent: input.toAgent,
        system,
      },
    });

    const entry: MissionMessageLogEntry = {
      ...message,
      deliveredToSessionId: sessionId,
      deliveryStatus: "sent",
    };
    appendMissionMessage(input.missionId, entry);
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
}): Promise<{ sessionId: string; messageId: string }> {
  return deliverMissionMessage({
    missionId: input.missionId,
    fromAgent: "noctis",
    toAgent: input.toAgent,
    type: "message",
    body: input.body,
  });
}

export async function sendWorkerReport(input: {
  missionId: string;
  fromAgent: AgentId;
  taskId: string;
  status: ReportStatus;
  summary: string;
  details?: string;
  artifacts?: string[];
}): Promise<{ sessionId: string; messageId: string }> {
  const sections = [`summary: ${input.summary}`];
  if (input.details?.trim()) {
    sections.push("details:");
    sections.push(input.details.trim());
  }

  return deliverMissionMessage({
    missionId: input.missionId,
    fromAgent: input.fromAgent,
    toAgent: "noctis",
    type: "report",
    body: sections.join("\n"),
    taskId: input.taskId,
    reportStatus: input.status,
    artifacts: input.artifacts,
  });
}
