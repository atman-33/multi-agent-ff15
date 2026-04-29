import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isWorkerAgentId } from "./agent-identity";
import { getProjectRoot } from "./get-project-root.server";
import type { ManagedSessionInfo } from "./managed-session.server";
import { findManagedSession } from "./managed-session.server";
import { getManagedSessionTitle } from "./managed-session-titles";
import { getMission, setMissionPrimarySession, setWorkerSession } from "./mission-store";
import { createProjectOpencodeClient, getOpencodeClient } from "./opencode-client";
import type { AgentId } from "./types/mission";
import { activateTmuxMissionWriteFocus, getTmuxMissionWriteConflict } from "./tmux-mission-activation.server";

type EndpointManifest = {
  agents: Array<{
    agentId: string;
    port: number;
    url: string;
  }>;
  startedAt: string;
  version: 1;
};

export interface SessionRouteTarget {
  client: ReturnType<typeof createProjectOpencodeClient>;
  endpointUrl: string | null;
  managedSession: ManagedSessionInfo | null;
  mode: "managed" | "default";
  ownerAgent: string | null;
}

export interface SessionStatusTarget {
  agentId: string;
  client: ReturnType<typeof createProjectOpencodeClient>;
  endpointUrl: string;
}

export interface TmuxWriteTarget {
  client: ReturnType<typeof createProjectOpencodeClient>;
  createdSession: boolean;
  endpointUrl: string;
  ownerAgent: AgentId;
  sessionId: string;
  sessionTitle: string;
}

function toErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return String(error);
}

function resolveManagedEndpointUrl(root: string, ownerAgent: string, context: string): string {
  const endpointUrl = readEndpointManifest(root)?.agents.find((agent) => agent.agentId === ownerAgent)?.url ?? null;

  if (!endpointUrl) {
    throw new Error(`No tmux transport endpoint configured for ${context} owner ${ownerAgent}.`);
  }

  return endpointUrl;
}

function readEndpointManifest(root: string): EndpointManifest | null {
  const manifestPath = join(root, "runtime", "opencode-endpoints.json");
  if (!existsSync(manifestPath)) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(manifestPath, "utf-8")) as unknown;
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (record.version !== 1 || typeof record.startedAt !== "string" || !Array.isArray(record.agents)) {
    return null;
  }

  const agents = record.agents
    .map((agent) => {
      if (!agent || typeof agent !== "object") {
        return null;
      }

      const entry = agent as Record<string, unknown>;
      if (
        typeof entry.agentId !== "string" ||
        typeof entry.port !== "number" ||
        typeof entry.url !== "string"
      ) {
        return null;
      }

      return {
        agentId: entry.agentId,
        port: entry.port,
        url: entry.url,
      };
    })
    .filter((agent): agent is NonNullable<typeof agent> => agent !== null);

  if (agents.length !== record.agents.length) {
    return null;
  }

  return {
    agents,
    startedAt: record.startedAt,
    version: 1,
  };
}

export function resolveSessionRouteTarget(sessionId: string): SessionRouteTarget {
  const managedSession = findManagedSession(sessionId);
  if (!managedSession) {
    return {
      client: getOpencodeClient(),
      endpointUrl: null,
      managedSession: null,
      mode: "default",
      ownerAgent: null,
    };
  }

  const root = getProjectRoot();
  const endpointUrl = resolveManagedEndpointUrl(root, managedSession.ownerAgent, `managed session ${sessionId}`);

  return {
    client: createProjectOpencodeClient(endpointUrl),
    endpointUrl,
    managedSession,
    mode: "managed",
    ownerAgent: managedSession.ownerAgent,
  };
}

export function listSessionStatusTargets(): SessionStatusTarget[] {
  const manifest = readEndpointManifest(getProjectRoot());
  if (!manifest) {
    return [];
  }

  return manifest.agents.map((agent) => ({
    agentId: agent.agentId,
    client: createProjectOpencodeClient(agent.url),
    endpointUrl: agent.url,
  }));
}

export async function resolveTmuxWriteTarget(input: {
  missionId: string;
  agentId: AgentId;
  sessionHostRoot: string;
}): Promise<TmuxWriteTarget> {
  const mission = getMission(input.missionId);
  if (!mission) {
    throw new Error("Mission not found");
  }

  const root = getProjectRoot();
  const defaultClient = getOpencodeClient();
  const conflict = await getTmuxMissionWriteConflict({
    appRoot: root,
    missionId: input.missionId,
    client: defaultClient,
  });
  if (conflict) {
    throw new Error(`Tmux write focus is still held by mission ${conflict.activeMissionId}.`);
  }

  activateTmuxMissionWriteFocus({ appRoot: root, missionId: input.missionId });

  const sessionTitle = getManagedSessionTitle(input.missionId, input.agentId);
  const existingSessionId = isWorkerAgentId(input.agentId)
    ? mission.workerSessions[input.agentId]
    : mission.primarySessionId || mission.noctisSessionId;
  const endpointUrl = resolveManagedEndpointUrl(root, input.agentId, `managed write target ${input.agentId}`);
  const client = createProjectOpencodeClient(endpointUrl);

  if (existingSessionId) {
    return {
      client,
      createdSession: false,
      endpointUrl,
      ownerAgent: input.agentId,
      sessionId: existingSessionId,
      sessionTitle,
    };
  }

  const sessionResult = await client.session.create({
    directory: input.sessionHostRoot,
    title: sessionTitle,
  });

  if (sessionResult.error) {
    throw new Error(toErrorMessage(sessionResult.error));
  }

  const sessionId = sessionResult.data?.id;
  if (!sessionId) {
    throw new Error("Session creation returned no ID");
  }

  if (isWorkerAgentId(input.agentId)) {
    setWorkerSession(input.missionId, input.agentId, sessionId);
  } else {
    setMissionPrimarySession(input.missionId, input.agentId, sessionId);
  }

  return {
    client,
    createdSession: true,
    endpointUrl,
    ownerAgent: input.agentId,
    sessionId,
    sessionTitle,
  };
}