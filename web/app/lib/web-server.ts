import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getProjectRoot } from "./get-project-root.server";

const SERVER_STATE_FILE = "web-server.json";

export type WebServerMode = "development" | "production";

export type WebServerRecord = {
  mode: WebServerMode;
  pid: number;
  port: number;
  projectRoot: string;
  startedAt: string;
  url: string;
  version: 1;
};

export type WebServerStatus = {
  error: string | null;
  mode: WebServerMode | null;
  pid: number | null;
  port: number | null;
  startedAt: string | null;
  state: "down" | "running";
  url: string | null;
  warning: string | null;
};

type WriteWebServerRecordInput = {
  mode: WebServerMode;
  pid: number;
  port: number;
  startedAt: string;
  url: string;
};

function getWebServerStatePath(root = getProjectRoot()): string {
  return join(root, "runtime", SERVER_STATE_FILE);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseWebServerRecord(value: unknown): WebServerRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    (record.mode !== "development" && record.mode !== "production") ||
    typeof record.pid !== "number" ||
    typeof record.port !== "number" ||
    typeof record.projectRoot !== "string" ||
    typeof record.startedAt !== "string" ||
    typeof record.url !== "string"
  ) {
    return null;
  }

  return {
    version: 1,
    mode: record.mode,
    pid: record.pid,
    port: record.port,
    projectRoot: record.projectRoot,
    startedAt: record.startedAt,
    url: record.url,
  };
}

export function readWebServerRecord(root = getProjectRoot()): WebServerRecord | null {
  const path = getWebServerStatePath(root);
  if (!existsSync(path)) {
    return null;
  }

  try {
    return parseWebServerRecord(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return null;
  }
}

export function writeWebServerRecord(
  input: WriteWebServerRecordInput,
  root = getProjectRoot(),
): void {
  const record: WebServerRecord = {
    version: 1,
    mode: input.mode,
    pid: input.pid,
    port: input.port,
    projectRoot: root,
    startedAt: input.startedAt,
    url: input.url,
  };

  mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(getWebServerStatePath(root), `${JSON.stringify(record, null, 2)}\n`, "utf-8");
}

export function clearWebServerRecord(root = getProjectRoot()): void {
  rmSync(getWebServerStatePath(root), { force: true });
}

export async function getWebServerStatus(root = getProjectRoot()): Promise<WebServerStatus> {
  const record = readWebServerRecord(root);
  if (!record) {
    return {
      error: null,
      mode: null,
      pid: null,
      port: null,
      startedAt: null,
      state: "down",
      url: null,
      warning: null,
    };
  }

  if (record.projectRoot !== root || !isProcessAlive(record.pid)) {
    clearWebServerRecord(root);
    return {
      error: null,
      mode: null,
      pid: null,
      port: null,
      startedAt: null,
      state: "down",
      url: null,
      warning: "Cleared stale web server state.",
    };
  }

  return {
    error: null,
    mode: record.mode,
    pid: record.pid,
    port: record.port,
    startedAt: record.startedAt,
    state: "running",
    url: record.url,
    warning: null,
  };
}
