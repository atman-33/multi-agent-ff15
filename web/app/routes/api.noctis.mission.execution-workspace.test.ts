import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMission,
  deleteMission,
  getMission,
  setWorkerSession,
} from "@/lib/mission-store";
import { getProjectRoot } from "@/lib/get-project-root.server";

const { promptAsyncMock, sessionCreateMock } = vi.hoisted(() => ({
  promptAsyncMock: vi.fn(),
  sessionCreateMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      create: sessionCreateMock,
      promptAsync: promptAsyncMock,
    },
  }),
}));

import { action as continueAction } from "./api.noctis.mission.continue";
import { action as startAction } from "./api.noctis.mission.start";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const repoRoot = getProjectRoot();

function initializeGitProject(projectRoot: string): void {
  writeFileSync(join(projectRoot, "AGENTS.md"), "# Agents\n", "utf-8");
  writeFileSync(join(projectRoot, "README.md"), "# Alpha\n", "utf-8");
  execSync("git init -b main", { cwd: projectRoot, stdio: "ignore" });
  execSync('git config user.email "test@example.com"', { cwd: projectRoot, stdio: "ignore" });
  execSync('git config user.name "Test User"', { cwd: projectRoot, stdio: "ignore" });
  execSync("git add README.md AGENTS.md", { cwd: projectRoot, stdio: "ignore" });
  execSync('git commit -m "init"', { cwd: projectRoot, stdio: "ignore" });
}

function createTempRoot(options?: { gitBacked?: boolean }): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-mission-workspace-"));
  tempRoots.push(root);
  cpSync(join(repoRoot, "builtins"), join(root, "builtins"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");

  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "projects", "alpha"), { recursive: true });
  mkdirSync(join(root, "external-alpha"), { recursive: true });
  if (options?.gitBacked !== false) {
    initializeGitProject(join(root, "external-alpha"));
  }

  writeFileSync(
    join(root, "config", "settings.yaml"),
    ['language: ja', 'execution_workspace_root: ".worktrees"', ''].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(root, "config", "current_projects.yaml"),
    [
      "project_scopes:",
      "  noctis_team:",
      "    active_project_ids:",
      '      - "alpha"',
      '      - "beta"',
      "  lunafreya:",
      "    active_project_ids: []",
      'updated_at: "2026-04-04T00:00:00.000Z"',
      'updated_by: "test"',
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(root, "projects", "alpha", "project.yaml"),
    [
      'id: "alpha"',
      'name: "Alpha Project"',
      'root_path: "../../external-alpha"',
      'default_base_branch: "main"',
      'serena_project: "alpha"',
      "instruction_files:",
      '  - path: "../../external-alpha/AGENTS.md"',
      "    enabled: true",
      "",
    ].join("\n"),
    "utf-8",
  );
  mkdirSync(join(root, "projects", "beta"), { recursive: true });
  writeFileSync(
    join(root, "projects", "beta", "project.yaml"),
    [
      'id: "beta"',
      'name: "Beta Project"',
      'root_path: "../../external-alpha"',
      'serena_project: "beta"',
      "",
    ].join("\n"),
    "utf-8",
  );

  return root;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

afterEach(() => {
  vi.clearAllMocks();
  for (const missionId of missionIds.splice(0)) {
    deleteMission(missionId);
  }

  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("Noctis mission execution workspace lifecycle", () => {
  it("provisions a shared clone workspace on mission start", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    sessionCreateMock.mockResolvedValue({ data: { id: "session-noctis-start" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-start" } });

    const response = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Implement execution workspace lifecycle.",
          executionProjectId: "alpha",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{ missionId: string }>(response);
    missionIds.push(data.missionId);

    const mission = getMission(data.missionId);
    expect(mission?.executionProjectId).toBe("alpha");
    expect(mission?.contextProjectIds).toEqual(["beta"]);
    expect(mission?.baseBranch).toBe("main");
    expect(mission?.branch).toMatch(/^mission\//);
    expect(mission?.workspaceStatus).toBe("ready");
    expect(mission?.workspacePath).toBeTruthy();
    expect(existsSync(mission?.workspacePath ?? "")).toBe(true);
    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: mission?.workspacePath,
        title: `mission:${data.missionId}`,
      }),
    );
  });

  it("blocks mission start when the selected execution project is not git-backed", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot({ gitBacked: false });

    const response = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "This should fail.",
          executionProjectId: "alpha",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(409);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: "Execution project must point to a git repository.",
    });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("recreates a missing workspace and fresh Noctis session on continue", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    sessionCreateMock
      .mockResolvedValueOnce({ data: { id: "session-noctis-start" } })
      .mockResolvedValueOnce({ data: { id: "session-noctis-recreated" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt" } });

    const startResponse = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Implement execution workspace lifecycle.",
          executionProjectId: "alpha",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(startResponse.status).toBe(200);
    const { missionId } = await readJson<{ missionId: string }>(startResponse);
    missionIds.push(missionId);

    const mission = getMission(missionId);
    setWorkerSession(missionId, "ignis", "worker-old");
    rmSync(mission?.workspacePath ?? "", { recursive: true, force: true });

    const continueResponse = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId,
          message: "Resume on a recreated workspace.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(continueResponse.status).toBe(200);
    expect(await readJson<{ noctisSessionId: string }>(continueResponse)).toEqual({
      noctisSessionId: "session-noctis-recreated",
    });
    expect(getMission(missionId)?.noctisSessionId).toBe("session-noctis-recreated");
    expect(getMission(missionId)?.workerSessions).toEqual({});
    expect(existsSync(getMission(missionId)?.workspacePath ?? "")).toBe(true);
  });

  it("blocks continue for legacy missions without an execution project", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const mission = createMission(`mission-legacy-${crypto.randomUUID()}`, "session-legacy", {
      title: "Legacy mission",
      objective: "Needs execution project assignment",
      allowedWorkers: [],
    });
    missionIds.push(mission.id);

    const response = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          message: "Attempt to resume a legacy mission.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(409);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: "Mission requires an execution project before it can be resumed.",
    });
  });
});