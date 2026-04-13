import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { getProjectRoot } from "./get-project-root.server";

const HOSTNAME = "127.0.0.1";
const LEGACY_URL = "http://127.0.0.1:4097";
const SERVER_START_TIMEOUT_MS = 15_000;
const SERVER_STATE_FILE = "opencode-server-web.json";
const PROCESS_RECLAIM_TIMEOUT_MS = 2_000;
const FORCE_RESTART_GRACE_TIMEOUT_MS = 5_000;
const FORCE_RESTART_KILL_TIMEOUT_MS = 1_000;
const FORCE_RESTART_UNAVAILABLE_ERROR =
  "Force restart is available only for a running app-owned OpenCode server";

type ManagedServer = {
  close(): void;
  pid: number;
  url: string;
};

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

class OpencodeRecoveryBlockedError extends Error {}
class OpencodeReclaimError extends Error {}

type StartResult = {
  lastStartedAt: string | null;
  managedByApp: boolean;
  server: ManagedServer | null;
  url: string;
};

export type OpencodeServerStatus = {
  checkedAt: string;
  error: string | null;
  foreignServerUrl: string | null;
  forceRestart: {
    availability: "available" | "blocked" | "unavailable";
    reason: string | null;
  };
  isRunning: boolean;
  lastStartedAt: string | null;
  managedByApp: boolean;
  recoveryBlocked: boolean;
  state: "down" | "running" | "starting";
  url: string | null;
  warning: string | null;
};

let serverUrl: string | null = null;
let startPromise: Promise<string> | null = null;
let managedServer: ManagedServer | null = null;
let managedByApp = false;
let lastError: string | null = null;
let lastStartedAt: string | null = null;
let recoveryBlocked = false;

function getForceRestartStatus(options: {
  isRunning: boolean;
  managedByApp: boolean;
  recoveryBlocked: boolean;
  state: "down" | "running" | "starting";
  url: string | null;
}): OpencodeServerStatus["forceRestart"] {
  if (options.recoveryBlocked) {
    return {
      availability: "blocked",
      reason: lastError,
    };
  }

  if (
    options.isRunning &&
    options.managedByApp &&
    options.state === "running" &&
    options.url
  ) {
    return {
      availability: "available",
      reason: null,
    };
  }

  return {
    availability: "unavailable",
    reason: FORCE_RESTART_UNAVAILABLE_ERROR,
  };
}

function getOpencodeServerStatePath(root = getProjectRoot()): string {
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

function readOpencodeServerRecord(root = getProjectRoot()): OpencodeServerRecord | null {
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

function writeOpencodeServerRecord(record: OpencodeServerRecord, root = getProjectRoot()): void {
  mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(getOpencodeServerStatePath(root), `${JSON.stringify(record, null, 2)}\n`, "utf-8");
}

function clearOpencodeServerRecord(root = getProjectRoot()): void {
  rmSync(getOpencodeServerStatePath(root), { force: true });
}

function getHealthCheckUrl(url: string): string {
  return `${url.replace(/\/$/, "")}/global/health`;
}

function getRecordedOpencodeBaseUrl(): string | null {
  return readOpencodeServerRecord()?.url ?? null;
}

async function getForeignServerInfo(appOwnedUrl: string | null): Promise<{
  foreignServerUrl: string | null;
  warning: string | null;
}> {
  if (appOwnedUrl === LEGACY_URL) {
    return {
      foreignServerUrl: null,
      warning: null,
    };
  }

  const legacyHealth = await probeServer(LEGACY_URL);
  if (!legacyHealth.ok) {
    return {
      foreignServerUrl: null,
      warning: null,
    };
  }

  return {
    foreignServerUrl: LEGACY_URL,
    warning:
      `Detected a healthy foreign OpenCode server at ${LEGACY_URL}. ` +
      "The web app ignored it because it only reuses app-owned servers.",
  };
}

async function probeServer(url: string): Promise<{ error: string | null; ok: boolean }> {
  try {
    const res = await fetch(getHealthCheckUrl(url), { signal: AbortSignal.timeout(2000) });
    if (!res.ok) {
      return {
        ok: false,
        error: `Health check failed with HTTP ${res.status}`,
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

function clearServerState(options?: { closeManagedServer?: boolean }): void {
  if (options?.closeManagedServer && managedServer) {
    try {
      managedServer.close();
    } catch {
      // ignore
    }
  }

  managedServer = null;
  managedByApp = false;
  serverUrl = null;
}

function getPortFromUrl(url: string): number {
  const parsed = new URL(url);
  return Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
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
  options?: { signal?: NodeJS.Signals | number; timeoutMs?: number }
): Promise<boolean> {
  const signal = options?.signal ?? "SIGTERM";
  const timeoutMs = options?.timeoutMs ?? PROCESS_RECLAIM_TIMEOUT_MS;

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

async function reservePort(hostname: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, hostname, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to allocate OpenCode server port"));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function startManagedServer(): Promise<ManagedServer> {
  const port = await reservePort(HOSTNAME);
  const proc = spawn(
    "opencode",
    ["serve", `--hostname=${HOSTNAME}`, `--port=${port}`],
    {
      env: {
        ...process.env,
        OPENCODE_CONFIG_CONTENT: JSON.stringify({}),
      },
    }
  );

  if (!proc.pid) {
    throw new Error("Failed to start OpenCode server process");
  }

  const url = await new Promise<string>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout waiting for server to start after ${SERVER_START_TIMEOUT_MS}ms`));
    }, SERVER_START_TIMEOUT_MS);

    let output = "";
    proc.stdout?.on("data", (chunk) => {
      output += chunk.toString();
      const lines = output.split("\n");
      for (const line of lines) {
        if (!line.startsWith("opencode server listening")) {
          continue;
        }

        const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
        if (!match) {
          clearTimeout(timeoutId);
          reject(new Error(`Failed to parse server url from output: ${line}`));
          return;
        }

        clearTimeout(timeoutId);
        resolve(match[1]);
        return;
      }
    });

    proc.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });

    proc.on("exit", (code) => {
      clearTimeout(timeoutId);
      let message = `Server exited with code ${code}`;
      if (output.trim()) {
        message += `\nServer output: ${output}`;
      }
      reject(new Error(message));
    });

    proc.on("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });

  return {
    pid: proc.pid,
    url,
    close() {
      proc.kill();
    },
  };
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

function createRecordedServerResult(record: OpencodeServerRecord): StartResult {
  return {
    lastStartedAt: record.startedAt,
    managedByApp: true,
    server: null,
    url: record.url,
  };
}

async function reclaimRecordedServer(
  root: string,
  inspection: Exclude<RecordedServerInspection, { kind: "missing" } | { kind: "valid" }>
): Promise<void> {
  if (inspection.kind === "stale-dead") {
    clearOpencodeServerRecord(root);
    return;
  }

  await terminateRecordedServer(root, inspection.record);
}

async function terminateRecordedServer(
  root: string,
  record: OpencodeServerRecord,
  options?: { allowForceKill?: boolean }
): Promise<void> {
  let terminated = await terminateProcess(record.pid, {
    signal: "SIGTERM",
    timeoutMs: options?.allowForceKill ? FORCE_RESTART_GRACE_TIMEOUT_MS : PROCESS_RECLAIM_TIMEOUT_MS,
  });

  if (!terminated && options?.allowForceKill) {
    terminated = await terminateProcess(record.pid, {
      signal: "SIGKILL",
      timeoutMs: FORCE_RESTART_KILL_TIMEOUT_MS,
    });
  }

  if (!terminated) {
    const message = `Failed to reclaim app-owned OpenCode server process ${record.pid}`;
    throw options?.allowForceKill
      ? new OpencodeRecoveryBlockedError(message)
      : new OpencodeReclaimError(message);
  }

  clearOpencodeServerRecord(root);
}

async function doStart(): Promise<StartResult> {
  const projectRoot = getProjectRoot();
  const inspection = await inspectRecordedServer(projectRoot);
  if (inspection.kind === "valid") {
    return createRecordedServerResult(inspection.record);
  }

  if (inspection.kind === "stale-dead" || inspection.kind === "stale-unhealthy") {
    await reclaimRecordedServer(projectRoot, inspection);
  }

  process.chdir(projectRoot);

  const server = await startManagedServer();
  const startedAt = new Date().toISOString();

  writeOpencodeServerRecord({
    version: 1,
    owner: "web-app",
    pid: server.pid,
    port: getPortFromUrl(server.url),
    projectRoot,
    startedAt,
    url: server.url,
  });

  return {
    lastStartedAt: startedAt,
    url: server.url,
    server,
    managedByApp: true,
  };
}

export async function ensureOpencodeServer(): Promise<string> {
  if (startPromise) {
    return startPromise;
  }

  if (serverUrl) {
    const health = await probeServer(serverUrl);
    if (health.ok) {
      lastError = null;
      return serverUrl;
    }

    lastError = health.error;
    clearServerState({ closeManagedServer: true });
    clearOpencodeServerRecord();
  }

  if (!startPromise) {
    startPromise = doStart()
      .then((result) => {
        managedServer = result.server;
        managedByApp = result.managedByApp;
        recoveryBlocked = false;
        serverUrl = result.url;
        lastError = null;
        lastStartedAt = result.lastStartedAt;
        return result.url;
      })
      .catch((err) => {
        clearServerState();
        if (err instanceof OpencodeRecoveryBlockedError || err instanceof OpencodeReclaimError) {
          const record = readOpencodeServerRecord();
          managedByApp = true;
          recoveryBlocked = err instanceof OpencodeRecoveryBlockedError;
          serverUrl = record?.url ?? serverUrl;
          lastStartedAt = record?.startedAt ?? lastStartedAt;
        } else {
          clearOpencodeServerRecord();
          recoveryBlocked = false;
        }

        lastError = err instanceof Error ? err.message : String(err);
        throw err;
      })
      .finally(() => {
        startPromise = null;
      });
  }

  return startPromise;
}

export async function getOpencodeServerStatus(): Promise<OpencodeServerStatus> {
  const checkedAt = new Date().toISOString();
  const projectRoot = getProjectRoot();
  const recordedUrl = readOpencodeServerRecord(projectRoot)?.url ?? null;
  const pendingUrl = serverUrl ?? recordedUrl;
  const pendingForeignServer = await getForeignServerInfo(pendingUrl);

  if (startPromise) {
    const state = "starting" as const;
    return {
      checkedAt,
      error: lastError,
      foreignServerUrl: pendingForeignServer.foreignServerUrl,
      forceRestart: getForceRestartStatus({
        isRunning: false,
        managedByApp,
        recoveryBlocked,
        state,
        url: pendingUrl,
      }),
      isRunning: false,
      lastStartedAt,
      managedByApp,
      recoveryBlocked,
      state,
      url: pendingUrl,
      warning: pendingForeignServer.warning,
    };
  }

  if (!serverUrl) {
    const inspection = await inspectRecordedServer(projectRoot);
    if (inspection.kind === "stale-dead") {
      clearOpencodeServerRecord(projectRoot);
    }

    if (inspection.kind === "valid") {
      const recordedServer = createRecordedServerResult(inspection.record);
      managedServer = null;
      managedByApp = true;
      serverUrl = recordedServer.url;
      lastStartedAt = recordedServer.lastStartedAt;
    }
  }

  const activeUrl = serverUrl ?? readOpencodeServerRecord(projectRoot)?.url ?? null;
  const foreignServer = await getForeignServerInfo(activeUrl);

  if (!activeUrl) {
    const state = "down" as const;
    return {
      checkedAt,
      error: recoveryBlocked ? lastError : lastError,
      foreignServerUrl: foreignServer.foreignServerUrl,
      forceRestart: getForceRestartStatus({
        isRunning: false,
        managedByApp,
        recoveryBlocked,
        state,
        url: null,
      }),
      isRunning: false,
      lastStartedAt,
      managedByApp,
      recoveryBlocked,
      state,
      url: null,
      warning: foreignServer.warning,
    };
  }

  const health = await probeServer(activeUrl);
  if (health.ok) {
    serverUrl = activeUrl;
    lastError = null;
    const state = "running" as const;
    return {
      checkedAt,
      error: null,
      foreignServerUrl: foreignServer.foreignServerUrl,
      forceRestart: getForceRestartStatus({
        isRunning: true,
        managedByApp,
        recoveryBlocked,
        state,
        url: activeUrl,
      }),
      isRunning: true,
      lastStartedAt,
      managedByApp,
      recoveryBlocked,
      state,
      url: activeUrl,
      warning: foreignServer.warning,
    };
  }

  const state = "down" as const;
  return {
    checkedAt,
    error: lastError ?? health.error,
    foreignServerUrl: foreignServer.foreignServerUrl,
    forceRestart: getForceRestartStatus({
      isRunning: false,
      managedByApp,
      recoveryBlocked,
      state,
      url: activeUrl,
    }),
    isRunning: false,
    lastStartedAt,
    managedByApp,
    recoveryBlocked,
    state,
    url: activeUrl,
    warning: foreignServer.warning,
  };
}

export async function recoverOpencodeServer(): Promise<OpencodeServerStatus> {
  try {
    await ensureOpencodeServer();
  } catch {
    // Surface recoverable status instead of throwing through the API route.
  }

  return getOpencodeServerStatus();
}

export async function forceRestartOpencodeServer(): Promise<OpencodeServerStatus> {
  const projectRoot = getProjectRoot();
  const inspection = await inspectRecordedServer(projectRoot);

  if (inspection.kind !== "valid") {
    if (inspection.kind === "stale-dead") {
      clearOpencodeServerRecord(projectRoot);
    }

    clearServerState();
    recoveryBlocked = false;
    lastError = FORCE_RESTART_UNAVAILABLE_ERROR;
    return getOpencodeServerStatus();
  }

  try {
    await terminateRecordedServer(projectRoot, inspection.record, { allowForceKill: true });
    clearServerState();
    recoveryBlocked = false;
    lastError = null;
    await ensureOpencodeServer();
  } catch (error) {
    managedServer = null;
    managedByApp = true;
    recoveryBlocked = error instanceof OpencodeRecoveryBlockedError;
    serverUrl = inspection.record.url;
    lastStartedAt = inspection.record.startedAt;
    lastError = error instanceof Error ? error.message : String(error);

    if (recoveryBlocked) {
      const state = "running" as const;
      const checkedAt = new Date().toISOString();
      const foreignServer = await getForeignServerInfo(serverUrl);
      return {
        checkedAt,
        error: lastError,
        foreignServerUrl: foreignServer.foreignServerUrl,
        forceRestart: getForceRestartStatus({
          isRunning: true,
          managedByApp,
          recoveryBlocked,
          state,
          url: serverUrl,
        }),
        isRunning: true,
        lastStartedAt,
        managedByApp,
        recoveryBlocked,
        state,
        url: serverUrl,
        warning: foreignServer.warning,
      };
    }
  }

  return getOpencodeServerStatus();
}

export function getOpencodeBaseUrl(): string {
  const url = serverUrl ?? getRecordedOpencodeBaseUrl();
  if (!url) {
    throw new Error("App-owned OpenCode server URL is not available");
  }

  return url;
}
