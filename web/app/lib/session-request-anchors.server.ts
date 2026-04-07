import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  isSessionSelection,
  type SessionSelection,
} from "@/lib/session-selection-adjustment";

export type SessionRequestAnchor = {
  createdAt: string;
  requested: SessionSelection;
};

interface SessionRequestAnchorStateFile {
  sessions: Record<string, Record<string, SessionRequestAnchor>>;
  version: 1;
}

function getEmptyState(): SessionRequestAnchorStateFile {
  return { version: 1, sessions: {} };
}

export function getSessionRequestAnchorStatePath(root = getProjectRoot()): string {
  return join(root, "runtime", "opencode-session-request-anchors.json");
}

function ensureStateDir(root = getProjectRoot()): void {
  const dir = dirname(getSessionRequestAnchorStatePath(root));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function sanitizeAnchor(value: unknown): SessionRequestAnchor | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.createdAt !== "string" || !isSessionSelection(candidate.requested)) {
    return null;
  }

  return {
    createdAt: candidate.createdAt,
    requested: candidate.requested,
  };
}

function readState(root = getProjectRoot()): SessionRequestAnchorStateFile {
  const filePath = getSessionRequestAnchorStatePath(root);
  if (!existsSync(filePath)) {
    return getEmptyState();
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<SessionRequestAnchorStateFile>;
    const sessions =
      parsed.sessions && typeof parsed.sessions === "object"
        ? Object.fromEntries(
            Object.entries(parsed.sessions).map(([sessionId, anchors]) => [
              sessionId,
              anchors && typeof anchors === "object"
                ? Object.fromEntries(
                    Object.entries(anchors)
                      .map(([messageId, anchor]) => [messageId, sanitizeAnchor(anchor)])
                      .filter((entry): entry is [string, SessionRequestAnchor] => entry[1] !== null),
                  )
                : {},
            ]),
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

function writeState(state: SessionRequestAnchorStateFile, root = getProjectRoot()): void {
  ensureStateDir(root);
  writeFileSync(getSessionRequestAnchorStatePath(root), JSON.stringify(state, null, 2), "utf-8");
}

export function listSessionRequestAnchors(sessionId: string): Record<string, SessionRequestAnchor> {
  return readState().sessions[sessionId] ?? {};
}

export function saveSessionRequestAnchor(input: {
  requested: SessionSelection;
  sessionId: string;
  userMessageId: string;
}): SessionRequestAnchor {
  const state = readState();
  const nextAnchor: SessionRequestAnchor = {
    createdAt: new Date().toISOString(),
    requested: input.requested,
  };

  state.sessions[input.sessionId] = {
    ...(state.sessions[input.sessionId] ?? {}),
    [input.userMessageId]: nextAnchor,
  };

  writeState(state);

  return nextAnchor;
}