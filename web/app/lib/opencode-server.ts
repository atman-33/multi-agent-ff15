import { createOpencodeServer } from "@opencode-ai/sdk/server";
import { getProjectRoot } from "./get-project-root.server";

const DEFAULT_URL = "http://127.0.0.1:4097";

type ManagedServer = Awaited<ReturnType<typeof createOpencodeServer>>;
type StartResult = {
  managedByApp: boolean;
  server: ManagedServer | null;
  url: string;
};

export type OpencodeServerStatus = {
  checkedAt: string;
  error: string | null;
  isRunning: boolean;
  lastStartedAt: string | null;
  managedByApp: boolean;
  state: "down" | "running" | "starting";
  url: string;
};

let serverUrl: string | null = null;
let startPromise: Promise<string> | null = null;
let managedServer: ManagedServer | null = null;
let managedByApp = false;
let lastError: string | null = null;
let lastStartedAt: string | null = null;

function getHealthCheckUrl(url: string): string {
  return `${url.replace(/\/$/, "")}/global/health`;
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

async function doStart(): Promise<StartResult> {
  const existingServer = await probeServer(DEFAULT_URL);
  if (existingServer.ok) {
    return {
      url: DEFAULT_URL,
      server: null,
      managedByApp: false,
    };
  }

  const projectRoot = getProjectRoot();
  process.chdir(projectRoot);

  const server = await createOpencodeServer({
    hostname: "127.0.0.1",
    port: 4097,
    timeout: 15_000,
  });

  return {
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
  }

  if (!startPromise) {
    startPromise = doStart()
      .then((result) => {
        managedServer = result.server;
        managedByApp = result.managedByApp;
        serverUrl = result.url;
        lastError = null;
        lastStartedAt = result.managedByApp ? new Date().toISOString() : null;
        return result.url;
      })
      .catch((err) => {
        clearServerState();
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
  const url = serverUrl ?? DEFAULT_URL;

  if (startPromise) {
    return {
      checkedAt,
      error: lastError,
      isRunning: false,
      lastStartedAt,
      managedByApp,
      state: "starting",
      url,
    };
  }

  const health = await probeServer(url);
  if (health.ok) {
    serverUrl = url;
    lastError = null;
    return {
      checkedAt,
      error: null,
      isRunning: true,
      lastStartedAt,
      managedByApp,
      state: "running",
      url,
    };
  }

  return {
    checkedAt,
    error: health.error ?? lastError,
    isRunning: false,
    lastStartedAt,
    managedByApp,
    state: "down",
    url,
  };
}

export async function recoverOpencodeServer(): Promise<OpencodeServerStatus> {
  await ensureOpencodeServer();
  return getOpencodeServerStatus();
}

export function getOpencodeBaseUrl(): string {
  return serverUrl ?? DEFAULT_URL;
}
