import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ManagedSessionInfo } from "./managed-session.server";
import { findManagedSession } from "./managed-session.server";
import { createProjectOpencodeClient, getOpencodeClient } from "./opencode-client";
import { getProjectRoot } from "./get-project-root.server";

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
  const endpointUrl =
    readEndpointManifest(root)?.agents.find((agent) => agent.agentId === managedSession.ownerAgent)?.url ??
    null;

  if (!endpointUrl) {
    throw new Error(
      `No tmux transport endpoint configured for managed session ${sessionId} owner ${managedSession.ownerAgent}.`,
    );
  }

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