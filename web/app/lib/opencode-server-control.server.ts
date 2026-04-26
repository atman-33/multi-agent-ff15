import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export const LEGACY_OPENCODE_SERVER_URL = "http://127.0.0.1:4097";

const HEALTH_CHECK_TIMEOUT_MS = 2_000;
const SERVER_STATE_FILE = "opencode-server-web.json";
const STOP_GRACE_TIMEOUT_MS = 5_000;
const STOP_KILL_TIMEOUT_MS = 1_000;

type OpencodeServerRecord = {
  owner: "web-app";
  pid: number;
  port: number;
  projectRoot: string;
  startedAt: string;
  url: string;
  version: 1;
};

type RecordedServerInspection =
  | {
      kind: "missing";
    }
  | {
      kind: "stale-dead";
      record: OpencodeServerRecord;
    }
  | {
      error: string | null;
      kind: "stale-unhealthy";
      record: OpencodeServerRecord;
    }
  | {
      kind: "valid";
      record: OpencodeServerRecord;
    };

export type ManagedOpencodeServerStatus = {
  error: string | null;
  foreignServerUrl: string | null;
  isRunning: boolean;
  lastStartedAt: string | null;
  managedByApp: boolean;
  pid: number | null;
  recordState: RecordedServerInspection["kind"];
  state: "down" | "running";
  url: string | null;
  warning: string | null;
};

export type StopManagedOpencodeServerResult = {
  error: string | null;
  previousPid: number | null;
  previousRecordState: ManagedOpencodeServerStatus["recordState"];
  previousUrl: string | null;
  status: ManagedOpencodeServerStatus;
  stopped: boolean;
};

function getOpencodeServerStatePath(root: string): string {
  return join(root, "runtime", SERVER_STATE_FILE);
}

function parseOpencodeServerRecord(value: unknown): OpencodeServerRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    record.owner !== "web-app" ||
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
    owner: "web-app",
    pid: record.pid,
    port: record.port,
    projectRoot: record.projectRoot,
    startedAt: record.startedAt,
    url: record.url,
  };
}

function readOpencodeServerRecord(root: string): OpencodeServerRecord | null {
  const path = getOpencodeServerStatePath(root);
  if (!existsSync(path)) {
    return null;
  }

  try {
    return parseOpencodeServerRecord(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return null;
  }
}

function clearOpencodeServerRecord(root: string): void {
  rmSync(getOpencodeServerStatePath(root), { force: true });
}

function getHealthCheckUrl(url: string): string {
  return `${url.replace(/\/$/, "")}/global/health`;
}

async function probeServer(url: string): Promise<{ error: string | null; ok: boolean }> {
  try {
    const response = await fetch(getHealthCheckUrl(url), {
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Health check failed with HTTP ${response.status}`,
      };
    }

    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getForeignServerInfo(appOwnedUrl: string | null): Promise<{
  foreignServerUrl: string | null;
  warning: string | null;
}> {
  if (appOwnedUrl === LEGACY_OPENCODE_SERVER_URL) {
    return {
      foreignServerUrl: null,
      warning: null,
    };
  }

  const legacyHealth = await probeServer(LEGACY_OPENCODE_SERVER_URL);
  if (!legacyHealth.ok) {
    return {
      foreignServerUrl: null,
      warning: null,
    };
  }

  return {
    foreignServerUrl: LEGACY_OPENCODE_SERVER_URL,
    warning:
      `Detected a healthy foreign OpenCode server at ${LEGACY_OPENCODE_SERVER_URL}. ` +
      "standby.sh will leave it running.",
  };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminateProcess(
  pid: number,
  options?: { signal?: NodeJS.Signals | number; timeoutMs?: number },
): Promise<boolean> {
  const signal = options?.signal ?? "SIGTERM";
  const timeoutMs = options?.timeoutMs ?? STOP_GRACE_TIMEOUT_MS;

  try {
    process.kill(pid, signal);
  } catch {
    return !isProcessAlive(pid);
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return true;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  return !isProcessAlive(pid);
}

async function inspectRecordedServer(root: string): Promise<RecordedServerInspection> {
  const record = readOpencodeServerRecord(root);
  if (!record) {
    return { kind: "missing" };
  }

  if (record.projectRoot !== root || !isProcessAlive(record.pid)) {
    return {
      kind: "stale-dead",
      record,
    };
  }

  const health = await probeServer(record.url);
  if (!health.ok) {
    return {
      error: health.error,
      kind: "stale-unhealthy",
      record,
    };
  }

  return {
    kind: "valid",
    record,
  };
}

export async function getManagedOpencodeServerStatus(
  root: string,
): Promise<ManagedOpencodeServerStatus> {
  const inspection = await inspectRecordedServer(root);

  if (inspection.kind === "stale-dead") {
    clearOpencodeServerRecord(root);
  }

  const appOwnedUrl =
    inspection.kind === "valid" || inspection.kind === "stale-unhealthy"
      ? inspection.record.url
      : null;
  const foreignServer = await getForeignServerInfo(appOwnedUrl);

  switch (inspection.kind) {
    case "missing":
      return {
        error: null,
        foreignServerUrl: foreignServer.foreignServerUrl,
        isRunning: false,
        lastStartedAt: null,
        managedByApp: false,
        pid: null,
        recordState: "missing",
        state: "down",
        url: null,
        warning: foreignServer.warning,
      };
    case "stale-dead":
      return {
        error: null,
        foreignServerUrl: foreignServer.foreignServerUrl,
        isRunning: false,
        lastStartedAt: null,
        managedByApp: false,
        pid: null,
        recordState: "stale-dead",
        state: "down",
        url: null,
        warning: foreignServer.warning,
      };
    case "stale-unhealthy":
      return {
        error: inspection.error,
        foreignServerUrl: foreignServer.foreignServerUrl,
        isRunning: false,
        lastStartedAt: inspection.record.startedAt,
        managedByApp: true,
        pid: inspection.record.pid,
        recordState: "stale-unhealthy",
        state: "down",
        url: inspection.record.url,
        warning: foreignServer.warning,
      };
    case "valid":
      return {
        error: null,
        foreignServerUrl: foreignServer.foreignServerUrl,
        isRunning: true,
        lastStartedAt: inspection.record.startedAt,
        managedByApp: true,
        pid: inspection.record.pid,
        recordState: "valid",
        state: "running",
        url: inspection.record.url,
        warning: foreignServer.warning,
      };
  }
}

export async function stopManagedOpencodeServer(
  root: string,
): Promise<StopManagedOpencodeServerResult> {
  const inspection = await inspectRecordedServer(root);
  const previousPid = inspection.kind === "missing" ? null : inspection.record.pid;
  const previousUrl = inspection.kind === "missing" ? null : inspection.record.url;

  let error: string | null = null;
  let stopped = false;

  if (inspection.kind === "stale-dead") {
    clearOpencodeServerRecord(root);
  }

  if (inspection.kind === "valid" || inspection.kind === "stale-unhealthy") {
    let terminated = await terminateProcess(inspection.record.pid, {
      signal: "SIGTERM",
      timeoutMs: STOP_GRACE_TIMEOUT_MS,
    });

    if (!terminated) {
      terminated = await terminateProcess(inspection.record.pid, {
        signal: "SIGKILL",
        timeoutMs: STOP_KILL_TIMEOUT_MS,
      });
    }

    if (!terminated) {
      error = `Failed to stop app-owned OpenCode server process ${inspection.record.pid}`;
    } else {
      clearOpencodeServerRecord(root);
      stopped = true;
    }
  }

  return {
    error,
    previousPid,
    previousRecordState: inspection.kind,
    previousUrl,
    status: await getManagedOpencodeServerStatus(root),
    stopped,
  };
}