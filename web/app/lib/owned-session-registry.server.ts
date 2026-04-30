import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getProjectRoot } from "@/lib/get-project-root.server";

export type OwnedSessionSurface = "operation-studio-iris" | "projects-iris";

export interface OwnedSessionEntry {
  ownerAgent: "iris";
  sessionTitle: string;
  surface: OwnedSessionSurface;
  transportMode: "tmux-resident";
  updatedAt: string;
}

export function getOwnedSessionTitle(sessionId: string): string {
  return `session:${sessionId}:iris`;
}

export function hasOwnedSessionTitle(sessionId: string, sessionTitle: string): boolean {
  return sessionTitle === getOwnedSessionTitle(sessionId);
}

interface OwnedSessionRegistryState {
  sessions: Record<string, OwnedSessionEntry>;
  version: 1;
}

function getEmptyState(): OwnedSessionRegistryState {
  return {
    sessions: {},
    version: 1,
  };
}

function ensureStateDir(root: string): void {
  mkdirSync(join(root, "runtime"), { recursive: true });
}

function readState(root = getProjectRoot()): OwnedSessionRegistryState {
  const path = getOwnedSessionRegistryStatePath(root);
  if (!existsSync(path)) {
    return getEmptyState();
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as Partial<OwnedSessionRegistryState>;
    if (parsed.version !== 1 || !parsed.sessions || typeof parsed.sessions !== "object") {
      return getEmptyState();
    }

    return {
      sessions: parsed.sessions as Record<string, OwnedSessionEntry>,
      version: 1,
    };
  } catch {
    return getEmptyState();
  }
}

function writeState(state: OwnedSessionRegistryState, root = getProjectRoot()): void {
  ensureStateDir(root);
  writeFileSync(getOwnedSessionRegistryStatePath(root), `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

export function getOwnedSessionRegistryStatePath(root = getProjectRoot()): string {
  return join(root, "runtime", "owned-session-registry.json");
}

export function listOwnedSessions(): Record<string, OwnedSessionEntry> {
  return readState().sessions;
}

export function readOwnedSession(sessionId: string): OwnedSessionEntry | null {
  return readState().sessions[sessionId] ?? null;
}

export function saveOwnedSession(input: {
  ownerAgent: "iris";
  sessionId: string;
  sessionTitle: string;
  surface: OwnedSessionSurface;
  transportMode: "tmux-resident";
}): OwnedSessionEntry {
  const state = readState();
  const entry: OwnedSessionEntry = {
    ownerAgent: input.ownerAgent,
    sessionTitle: input.sessionTitle,
    surface: input.surface,
    transportMode: input.transportMode,
    updatedAt: new Date().toISOString(),
  };

  state.sessions[input.sessionId] = entry;
  writeState(state);

  return entry;
}