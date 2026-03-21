import { getOpencodeClient } from "@/lib/opencode-client";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { buildInjectedPromptContext } from "@/lib/prompt-context.server";
import { appendMissionMessage, getMission, setWorkerSession } from "@/lib/mission-store";
import type {
  AgentId,
  MissionMessageLogEntry,
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
 * Validate intent contract against policy:
 * - notify (query intent): best-effort one-way notification; no reply expected
 * - dispatch flow uses task API, not team messages
 * - report/update MUST include taskId for tracking
 */
function assertIntentContract(message: SendTeamMessageInput): void {
  // report/update must include taskId for tracking
  if ((message.type === "report" || message.type === "update") && !message.taskId) {
    throw new Error("Report/update messages must include taskId");
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

export async function sendTeamMessage(
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
