import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";

const DEBUG_LOG_FILE = "opencode-session-payload-debug.jsonl";
const MAX_STRING_LENGTH = 4000;
const MAX_DEPTH = 6;

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

export type SessionPromptDebugEvent = {
  route:
    | "api.opencode.session.start"
    | "api.session.$id.prompt"
    | "api.session.$id.abort";
  stage:
    | "request-received"
    | "prompt-dispatched"
    | "prompt-result"
    | "prompt-error"
    | "abort-requested"
    | "abort-result"
    | "abort-error";
  requestId: string;
  sessionId?: string;
  payload: unknown;
};

export function getSessionPromptDebugLogPath(root = getProjectRoot()): string {
  return join(root, "logs", DEBUG_LOG_FILE);
}

function ensureLogDir(root = getProjectRoot()): void {
  const dir = dirname(getSessionPromptDebugLogPath(root));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}... [truncated ${value.length - MAX_STRING_LENGTH} chars]`;
}

function sanitizeValue(value: unknown, depth = 0): JsonLike {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    return {
      message: truncateString(value.message),
      name: value.name,
      stack: value.stack ? truncateString(value.stack) : null,
    };
  }

  if (depth >= MAX_DEPTH) {
    return "[max-depth]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeValue(item, depth + 1)])
    );
  }

  return String(value);
}

export function appendSessionPromptDebugLog(event: SessionPromptDebugEvent): void {
  try {
    const root = getProjectRoot();
    ensureLogDir(root);

    appendFileSync(
      getSessionPromptDebugLogPath(root),
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        ...event,
        payload: sanitizeValue(event.payload),
      })}\n`,
      "utf-8"
    );
  } catch {
    // Debug logging must never break message delivery.
  }
}