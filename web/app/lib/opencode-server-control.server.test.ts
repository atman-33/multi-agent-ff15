import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getManagedOpencodeServerStatus,
  LEGACY_OPENCODE_SERVER_URL,
  stopManagedOpencodeServer,
} from "./opencode-server-control.server";

const APP_SERVER_URL = "http://127.0.0.1:45211";
const STALE_SERVER_URL = "http://127.0.0.1:45100";

const tempRoots: string[] = [];
const originalFetch = globalThis.fetch;
let processKillSpy: { mockRestore(): void } | null = null;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-opencode-control-"));
  tempRoots.push(root);
  return root;
}

function installHealthProbeMock(options?: {
  appOk?: boolean;
  legacyOk?: boolean;
  staleOk?: boolean;
}): void {
  const appOk = options?.appOk ?? true;
  const legacyOk = options?.legacyOk ?? false;
  const staleOk = options?.staleOk ?? false;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === `${APP_SERVER_URL}/global/health`) {
      return new Response(appOk ? "ok" : "down", { status: appOk ? 200 : 503 });
    }

    if (url === `${STALE_SERVER_URL}/global/health`) {
      return new Response(staleOk ? "ok" : "stale", { status: staleOk ? 200 : 503 });
    }

    if (url === `${LEGACY_OPENCODE_SERVER_URL}/global/health`) {
      return new Response(legacyOk ? "ok" : "down", { status: legacyOk ? 200 : 503 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
}

function writeServerState(
  root: string,
  state: {
    pid: number;
    projectRoot?: string;
    startedAt?: string;
    url: string;
  },
): string {
  const runtimeDir = join(root, "runtime");
  const filePath = join(runtimeDir, "opencode-server-web.json");

  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        version: 1,
        owner: "web-app",
        pid: state.pid,
        port: Number(new URL(state.url).port),
        projectRoot: state.projectRoot ?? root,
        startedAt: state.startedAt ?? "2026-04-08T00:00:00.000Z",
        url: state.url,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  return filePath;
}

function installProcessKillMock(options?: {
  alivePids?: number[];
  removablePids?: number[];
  removableSignalsByPid?: Record<number, Array<NodeJS.Signals | number>>;
}): void {
  const alivePids = new Set(options?.alivePids ?? []);
  const removablePids = new Set(options?.removablePids ?? []);
  const removableSignalsByPid = options?.removableSignalsByPid ?? {};

  processKillSpy = vi.spyOn(process, "kill").mockImplementation(
    ((pid: number, signal?: NodeJS.Signals | number) => {
      if (signal === 0 || signal === undefined) {
        if (alivePids.has(pid)) {
          return true;
        }

        throw new Error(`pid ${pid} is not running`);
      }

      if (!alivePids.has(pid)) {
        throw new Error(`pid ${pid} is not running`);
      }

      if (
        removablePids.has(pid) ||
        removableSignalsByPid[pid]?.some((candidate) => candidate === signal)
      ) {
        alivePids.delete(pid);
        return true;
      }

      return true;
    }) as typeof process.kill,
  );
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  processKillSpy?.mockRestore();
  processKillSpy = null;
  vi.useRealTimers();

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("opencode-server-control.server", () => {
  it("reports a running app-owned server from runtime state", async () => {
    const root = createTempRoot();
    installHealthProbeMock({ appOk: true, legacyOk: false, staleOk: false });
    installProcessKillMock({ alivePids: [45678] });
    writeServerState(root, {
      pid: 45678,
      url: APP_SERVER_URL,
    });

    const status = await getManagedOpencodeServerStatus(root);

    expect(status).toMatchObject({
      error: null,
      foreignServerUrl: null,
      isRunning: true,
      managedByApp: true,
      pid: 45678,
      recordState: "valid",
      state: "running",
      url: APP_SERVER_URL,
    });
  });

  it("reports a healthy foreign legacy server without treating it as app-owned", async () => {
    const root = createTempRoot();
    installHealthProbeMock({ appOk: false, legacyOk: true, staleOk: false });

    const status = await getManagedOpencodeServerStatus(root);

    expect(status).toMatchObject({
      error: null,
      foreignServerUrl: LEGACY_OPENCODE_SERVER_URL,
      isRunning: false,
      managedByApp: false,
      pid: null,
      recordState: "missing",
      state: "down",
      url: null,
    });
    expect(status.warning).toContain(LEGACY_OPENCODE_SERVER_URL);
  });

  it("reports an unhealthy app-owned server as down", async () => {
    const root = createTempRoot();
    installHealthProbeMock({ appOk: false, legacyOk: false, staleOk: false });
    installProcessKillMock({ alivePids: [34567] });
    writeServerState(root, {
      pid: 34567,
      url: STALE_SERVER_URL,
    });

    const status = await getManagedOpencodeServerStatus(root);

    expect(status).toMatchObject({
      foreignServerUrl: null,
      isRunning: false,
      managedByApp: true,
      pid: 34567,
      recordState: "stale-unhealthy",
      state: "down",
      url: STALE_SERVER_URL,
    });
    expect(status.error).toContain("HTTP 503");
  });

  it("stops a healthy app-owned server and clears runtime state", async () => {
    const root = createTempRoot();
    const statePath = writeServerState(root, {
      pid: 34567,
      url: APP_SERVER_URL,
    });
    installHealthProbeMock({ appOk: true, legacyOk: false, staleOk: false });
    installProcessKillMock({ alivePids: [34567], removablePids: [34567] });

    const result = await stopManagedOpencodeServer(root);

    expect(result).toMatchObject({
      error: null,
      previousPid: 34567,
      previousRecordState: "valid",
      previousUrl: APP_SERVER_URL,
      stopped: true,
    });
    expect(result.status).toMatchObject({
      isRunning: false,
      managedByApp: false,
      recordState: "missing",
      state: "down",
      url: null,
    });
    expect(existsSync(statePath)).toBe(false);
    expect(processKillSpy).toHaveBeenCalledWith(34567, "SIGTERM");
  });

  it("clears a stale dead record without touching a foreign legacy server", async () => {
    const root = createTempRoot();
    const statePath = writeServerState(root, {
      pid: 34567,
      url: STALE_SERVER_URL,
    });
    installHealthProbeMock({ appOk: false, legacyOk: true, staleOk: false });
    installProcessKillMock({ alivePids: [] });

    const result = await stopManagedOpencodeServer(root);

    expect(result).toMatchObject({
      error: null,
      previousPid: 34567,
      previousRecordState: "stale-dead",
      previousUrl: STALE_SERVER_URL,
      stopped: false,
    });
    expect(result.status).toMatchObject({
      foreignServerUrl: LEGACY_OPENCODE_SERVER_URL,
      isRunning: false,
      managedByApp: false,
      recordState: "missing",
      state: "down",
      url: null,
    });
    expect(existsSync(statePath)).toBe(false);
    expect(processKillSpy).toHaveBeenCalledWith(34567, 0);
    expect(processKillSpy).not.toHaveBeenCalledWith(34567, "SIGTERM");
  });
});