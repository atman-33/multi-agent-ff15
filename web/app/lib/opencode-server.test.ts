import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const APP_SERVER_URL = "http://127.0.0.1:45211";
const LEGACY_SERVER_URL = "http://127.0.0.1:4097";
const STALE_SERVER_URL = "http://127.0.0.1:45100";

const { getProjectRootMock, spawnMock } = vi.hoisted(() => ({
  getProjectRootMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock("@/lib/get-project-root.server", () => ({
  getProjectRoot: getProjectRootMock,
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

const tempRoots: string[] = [];
const originalFetch = globalThis.fetch;
let processKillSpy: { mockRestore(): void } | null = null;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-opencode-server-"));
  tempRoots.push(root);
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

function installHealthProbeMock(options?: {
  appOk?: boolean;
  legacyOk?: boolean;
  staleOk?: boolean;
}): void {
  const appOk = options?.appOk ?? true;
  const legacyOk = options?.legacyOk ?? true;
  const staleOk = options?.staleOk ?? false;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === `${LEGACY_SERVER_URL}/global/health`) {
      return new Response(legacyOk ? "ok" : "down", { status: legacyOk ? 200 : 503 });
    }

    if (url === `${APP_SERVER_URL}/global/health`) {
      return new Response(appOk ? "ok" : "down", { status: appOk ? 200 : 503 });
    }

    if (url === `${STALE_SERVER_URL}/global/health`) {
      return new Response(staleOk ? "ok" : "stale", { status: staleOk ? 200 : 503 });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
}

function installSpawnSuccess(options?: { pid?: number; url?: string }): void {
  const pid = options?.pid ?? 45678;
  const url = options?.url ?? APP_SERVER_URL;

  spawnMock.mockImplementation(() => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const emitter = new EventEmitter() as EventEmitter & {
      kill: ReturnType<typeof vi.fn>;
      pid: number;
      stderr: PassThrough;
      stdout: PassThrough;
    };

    emitter.stdout = stdout;
    emitter.stderr = stderr;
    emitter.pid = pid;
    emitter.kill = vi.fn(() => true);

    queueMicrotask(() => {
      stdout.write(`opencode server listening on ${url}\n`);
    });

    return emitter;
  });
}

function writeServerState(
  root: string,
  state: {
    pid: number;
    projectRoot?: string;
    startedAt?: string;
    url: string;
  }
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
      2
    )}\n`,
    "utf-8"
  );

  return filePath;
}

function installProcessKillMock(options?: { alivePids?: number[]; removablePids?: number[] }): void {
  const alivePids = new Set(options?.alivePids ?? []);
  const removablePids = new Set(options?.removablePids ?? []);

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

      if (removablePids.has(pid)) {
        alivePids.delete(pid);
        return true;
      }

      return true;
    }) as typeof process.kill
  );
}

async function loadModule() {
  vi.resetModules();
  return import("./opencode-server");
}

afterEach(() => {
  getProjectRootMock.mockReset();
  spawnMock.mockReset();
  globalThis.fetch = originalFetch;
  processKillSpy?.mockRestore();
  processKillSpy = null;

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("opencode-server", () => {
  it("does not fall back to the legacy shared URL when no app-owned server is available", async () => {
    const root = createTempRoot();
    getProjectRootMock.mockReturnValue(root);

    const module = await loadModule();

    expect(() => module.getOpencodeBaseUrl()).toThrow(
      "App-owned OpenCode server URL is not available"
    );
  });

  it("starts a dedicated app-owned server and persists ownership instead of reusing a healthy legacy server", async () => {
    const root = createTempRoot();
    getProjectRootMock.mockReturnValue(root);
    installHealthProbeMock();
    installSpawnSuccess();

    const module = await loadModule();
    const url = await module.ensureOpencodeServer();
    const status = await module.getOpencodeServerStatus();
    const statePath = join(root, "runtime", "opencode-server-web.json");

    expect(url).toBe(APP_SERVER_URL);
    expect(status).toMatchObject({
      isRunning: true,
      managedByApp: true,
      url: APP_SERVER_URL,
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(existsSync(statePath)).toBe(true);
    expect(JSON.parse(readFileSync(statePath, "utf-8"))).toMatchObject({
      pid: 45678,
      projectRoot: root,
      url: APP_SERVER_URL,
    });
  });

  it("reuses a healthy app-owned server recorded in runtime state", async () => {
    const root = createTempRoot();
    getProjectRootMock.mockReturnValue(root);
    installHealthProbeMock({ appOk: true, legacyOk: false, staleOk: false });
    installProcessKillMock({ alivePids: [45678] });
    writeServerState(root, {
      pid: 45678,
      url: APP_SERVER_URL,
    });

    const module = await loadModule();
    const url = await module.ensureOpencodeServer();

    expect(url).toBe(APP_SERVER_URL);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("clears a dead app-owned marker before starting a replacement server", async () => {
    const root = createTempRoot();
    getProjectRootMock.mockReturnValue(root);
    installHealthProbeMock({ appOk: true, legacyOk: false, staleOk: false });
    installProcessKillMock({ alivePids: [] });
    installSpawnSuccess({ pid: 56789, url: APP_SERVER_URL });

    const statePath = writeServerState(root, {
      pid: 34567,
      url: STALE_SERVER_URL,
    });

    const module = await loadModule();
    const url = await module.ensureOpencodeServer();

    expect(url).toBe(APP_SERVER_URL);
    expect(processKillSpy).toHaveBeenCalledWith(34567, 0);
    expect(processKillSpy).not.toHaveBeenCalledWith(34567, "SIGTERM");
    expect(JSON.parse(readFileSync(statePath, "utf-8"))).toMatchObject({
      pid: 56789,
      projectRoot: root,
      url: APP_SERVER_URL,
    });
  });

  it("terminates an unhealthy app-owned process before starting a replacement server", async () => {
    const root = createTempRoot();
    getProjectRootMock.mockReturnValue(root);
    installHealthProbeMock();
    installProcessKillMock({ alivePids: [34567], removablePids: [34567] });
    installSpawnSuccess({ pid: 56789, url: APP_SERVER_URL });

    const statePath = writeServerState(root, {
      pid: 34567,
      url: STALE_SERVER_URL,
    });

    const module = await loadModule();
    const url = await module.ensureOpencodeServer();

    expect(url).toBe(APP_SERVER_URL);
    expect(processKillSpy).toHaveBeenCalledWith(34567, 0);
    expect(processKillSpy).toHaveBeenCalledWith(34567, "SIGTERM");
    expect(JSON.parse(readFileSync(statePath, "utf-8"))).toMatchObject({
      pid: 56789,
      projectRoot: root,
      url: APP_SERVER_URL,
    });
  });

  it("reports recovery-blocked status and does not start a second server when reclaim fails", async () => {
    const root = createTempRoot();
    getProjectRootMock.mockReturnValue(root);
    installHealthProbeMock({ appOk: false, legacyOk: false, staleOk: false });
    installProcessKillMock({ alivePids: [34567] });
    installSpawnSuccess({ pid: 56789, url: APP_SERVER_URL });
    writeServerState(root, {
      pid: 34567,
      url: STALE_SERVER_URL,
    });

    const module = await loadModule();
    const status = await module.recoverOpencodeServer();

    expect(status).toMatchObject({
      isRunning: false,
      recoveryBlocked: true,
      url: STALE_SERVER_URL,
    });
    expect(status.error).toContain("Failed to reclaim app-owned OpenCode server process 34567");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("reports a warning when a healthy foreign legacy server is present but ignored", async () => {
    const root = createTempRoot();
    getProjectRootMock.mockReturnValue(root);
    installHealthProbeMock({ appOk: true, legacyOk: true, staleOk: false });
    installProcessKillMock({ alivePids: [56789] });
    writeServerState(root, {
      pid: 56789,
      url: APP_SERVER_URL,
    });

    const module = await loadModule();
    const status = await module.getOpencodeServerStatus();

    expect(status).toMatchObject({
      foreignServerUrl: LEGACY_SERVER_URL,
      isRunning: true,
      managedByApp: true,
      recoveryBlocked: false,
      url: APP_SERVER_URL,
    });
    expect(status.warning).toContain(LEGACY_SERVER_URL);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("starts an app-owned replacement during recover without terminating a foreign legacy server", async () => {
    const root = createTempRoot();
    getProjectRootMock.mockReturnValue(root);
    installHealthProbeMock({ appOk: true, legacyOk: true, staleOk: false });
    installProcessKillMock({ alivePids: [] });
    installSpawnSuccess({ pid: 56789, url: APP_SERVER_URL });

    const module = await loadModule();
    const status = await module.recoverOpencodeServer();

    expect(status).toMatchObject({
      foreignServerUrl: LEGACY_SERVER_URL,
      isRunning: true,
      managedByApp: true,
      recoveryBlocked: false,
      url: APP_SERVER_URL,
    });
    expect(processKillSpy).not.toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});