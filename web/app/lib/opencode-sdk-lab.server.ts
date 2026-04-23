import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { getOpencodeBaseUrl } from "@/lib/opencode-server";

const DEBUG_LOG_FILE = "opencode-sdk-lab-debug.jsonl";
const MAX_STRING_LENGTH = 4000;
const MAX_DEPTH = 6;

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

export type OpencodeSdkLabDebugEvent = {
  payload: unknown;
  requestId: string;
  sessionId?: string;
  stage:
    | "abort-error"
    | "abort-request"
    | "abort-result"
    | "create-error"
    | "create-request"
    | "create-result"
    | "messages-error"
    | "messages-request"
    | "messages-result"
    | "mission-preview-error"
    | "mission-preview-request"
    | "mission-preview-result"
    | "prompt-error"
    | "prompt-request"
    | "prompt-result";
};

export type OpencodeSdkLabSnapshot = {
  defaultDirectory: string;
  logPath: string;
  recentLogs: Array<Record<string, JsonLike>>;
  serverError: string | null;
  serverUrl: string | null;
};

export function getOpencodeSdkLabLogPath(root = getProjectRoot()): string {
  return join(root, "logs", DEBUG_LOG_FILE);
}

function ensureLogDir(root = getProjectRoot()): void {
  const dir = dirname(getOpencodeSdkLabLogPath(root));
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
      Object.entries(value).map(([key, item]) => [key, sanitizeValue(item, depth + 1)]),
    );
  }

  return String(value);
}

export function appendOpencodeSdkLabDebugLog(event: OpencodeSdkLabDebugEvent): void {
  try {
    const root = getProjectRoot();
    ensureLogDir(root);

    appendFileSync(
      getOpencodeSdkLabLogPath(root),
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        ...event,
        payload: sanitizeValue(event.payload),
      })}\n`,
      "utf-8",
    );
  } catch {
    // Debug logging must never break SDK lab interactions.
  }
}

export function readOpencodeSdkLabDebugLog(
  limit = 80,
  root = getProjectRoot(),
): Array<Record<string, JsonLike>> {
  const logPath = getOpencodeSdkLabLogPath(root);
  if (!existsSync(logPath)) {
    return [];
  }

  try {
    const lines = readFileSync(logPath, "utf-8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(-limit);

    return lines.flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as Record<string, JsonLike>;
        return [parsed];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function getOpencodeSdkLabSnapshot(limit = 80): OpencodeSdkLabSnapshot {
  const defaultDirectory = getProjectRoot();
  let serverUrl: string | null = null;
  let serverError: string | null = null;

  try {
    serverUrl = getOpencodeBaseUrl();
  } catch (error) {
    serverError = error instanceof Error ? error.message : String(error);
  }

  return {
    defaultDirectory,
    logPath: getOpencodeSdkLabLogPath(defaultDirectory),
    recentLogs: readOpencodeSdkLabDebugLog(limit, defaultDirectory),
    serverError,
    serverUrl,
  };
}