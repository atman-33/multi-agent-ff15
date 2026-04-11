import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  APP_ROOT_EXECUTION_PROJECT_ID,
  normalizeContextProjectIds,
  normalizeExecutionProjectId,
} from "@/lib/execution-context";
import { getProjectRoot } from "@/lib/get-project-root.server";

export interface SessionExecutionContextEntry {
  contextProjectIds: string[];
  executionProjectId: string;
  updatedAt: string | null;
}

interface SessionExecutionContextStateFile {
  sessions: Record<string, SessionExecutionContextEntry>;
  version: 1;
}

function getEmptyState(): SessionExecutionContextStateFile {
  return { version: 1, sessions: {} };
}

function getSessionExecutionContextStatePath(root = getProjectRoot()): string {
  return join(root, "runtime", "opencode-session-context.json");
}

function ensureStateDir(root = getProjectRoot()): void {
  const dir = dirname(getSessionExecutionContextStatePath(root));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function sanitizeEntry(value: unknown): SessionExecutionContextEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const executionProjectId =
    normalizeExecutionProjectId(candidate.executionProjectId) ?? APP_ROOT_EXECUTION_PROJECT_ID;

  return {
    executionProjectId,
    contextProjectIds: normalizeContextProjectIds(executionProjectId, candidate.contextProjectIds),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : null,
  };
}

function readState(root = getProjectRoot()): SessionExecutionContextStateFile {
  const filePath = getSessionExecutionContextStatePath(root);
  if (!existsSync(filePath)) {
    return getEmptyState();
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<SessionExecutionContextStateFile>;
    const sessions =
      parsed.sessions && typeof parsed.sessions === "object"
        ? Object.fromEntries(
            Object.entries(parsed.sessions)
              .map(([sessionId, entry]) => [sessionId, sanitizeEntry(entry)])
              .filter((entry): entry is [string, SessionExecutionContextEntry] => entry[1] !== null),
          )
        : {};

    return {
      version: 1,
      sessions,
    };
  } catch {
    return getEmptyState();
  }
}

function writeState(state: SessionExecutionContextStateFile, root = getProjectRoot()): void {
  ensureStateDir(root);
  writeFileSync(getSessionExecutionContextStatePath(root), JSON.stringify(state, null, 2), "utf-8");
}

export function listSessionExecutionContexts(): Record<string, SessionExecutionContextEntry> {
  return readState().sessions;
}

export function readSessionExecutionContext(sessionId: string): SessionExecutionContextEntry {
  return (
    readState().sessions[sessionId] ?? {
      executionProjectId: APP_ROOT_EXECUTION_PROJECT_ID,
      contextProjectIds: [],
      updatedAt: null,
    }
  );
}

export function saveSessionExecutionContext(
  sessionId: string,
  input: {
    contextProjectIds?: unknown;
    executionProjectId?: unknown;
  },
): SessionExecutionContextEntry {
  const state = readState();
  const executionProjectId =
    normalizeExecutionProjectId(input.executionProjectId) ?? APP_ROOT_EXECUTION_PROJECT_ID;
  const entry: SessionExecutionContextEntry = {
    executionProjectId,
    contextProjectIds: normalizeContextProjectIds(executionProjectId, input.contextProjectIds),
    updatedAt: new Date().toISOString(),
  };

  state.sessions[sessionId] = entry;
  writeState(state);

  return entry;
}