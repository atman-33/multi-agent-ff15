import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";

export type SessionArchiveView = "active" | "archived" | "all";

export interface SessionArchiveEntry {
  archivedAt: string | null;
}

interface SessionArchiveStateFile {
  version: 1;
  items: Record<string, SessionArchiveEntry>;
}

function getSessionArchiveStatePath(): string {
  return join(getProjectRoot(), "runtime", "opencode-session-state.json");
}

function ensureSessionArchiveStateDir(): void {
  const dir = dirname(getSessionArchiveStatePath());
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readSessionArchiveState(): SessionArchiveStateFile {
  const filePath = getSessionArchiveStatePath();
  if (!existsSync(filePath)) {
    return { version: 1, items: {} };
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<SessionArchiveStateFile>;
    const items = parsed.items;
    return {
      version: 1,
      items:
        items && typeof items === "object"
          ? Object.fromEntries(
              Object.entries(items).map(([sessionId, value]) => [
                sessionId,
                {
                  archivedAt:
                    value && typeof value.archivedAt === "string" ? value.archivedAt : null,
                },
              ])
            )
          : {},
    };
  } catch {
    return { version: 1, items: {} };
  }
}

function writeSessionArchiveState(state: SessionArchiveStateFile): void {
  ensureSessionArchiveStateDir();
  writeFileSync(getSessionArchiveStatePath(), JSON.stringify(state, null, 2), "utf-8");
}

export function listSessionArchiveEntries(): Record<string, SessionArchiveEntry> {
  return readSessionArchiveState().items;
}

export function archiveSession(sessionId: string): SessionArchiveEntry {
  const state = readSessionArchiveState();
  const entry: SessionArchiveEntry = { archivedAt: new Date().toISOString() };
  state.items[sessionId] = entry;
  writeSessionArchiveState(state);
  return entry;
}

export function restoreSession(sessionId: string): SessionArchiveEntry {
  const state = readSessionArchiveState();
  const existing = state.items[sessionId];
  const entry: SessionArchiveEntry = { archivedAt: null };

  if (existing) {
    delete state.items[sessionId];
    writeSessionArchiveState(state);
    return entry;
  }

  return entry;
}

export function matchesSessionArchiveView(
  archivedAt: string | null | undefined,
  view: SessionArchiveView
): boolean {
  if (view === "all") {
    return true;
  }

  const isArchived = Boolean(archivedAt);
  return view === "archived" ? isArchived : !isArchived;
}