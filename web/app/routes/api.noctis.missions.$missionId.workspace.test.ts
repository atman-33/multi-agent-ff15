import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getProjectRoot } from "@/lib/get-project-root.server";
import { provisionMissionExecutionWorkspace } from "@/lib/mission-execution-workspace.server";
import { createOperationState, saveOperationState } from "@/lib/operation-runtime/state";
import {
  createMission,
  deleteMission,
  getMission,
  setWorkerSession,
} from "@/lib/mission-store";

const { sessionAbortMock } = vi.hoisted(() => ({
  sessionAbortMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      abort: sessionAbortMock,
    },
  }),
}));

import { action as workspaceAction } from "./api.noctis.missions.$missionId.workspace";

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

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-workspace-route-"));
  tempRoots.push(root);
  cpSync(join(repoRoot, "builtins"), join(root, "builtins"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "projects", "alpha"), { recursive: true });
  mkdirSync(join(root, "external-alpha"), { recursive: true });
  initializeGitProject(join(root, "external-alpha"));

  writeFileSync(
    join(root, "config", "settings.yaml"),
    ['language: ja', 'execution_workspace_root: ".worktrees"', ''].join("\n"),
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
      "",
    ].join("\n"),
    "utf-8",
  );

  return root;
}

function createExecutionMission(root: string) {
  const missionId = `mission-${crypto.randomUUID()}`;
  missionIds.push(missionId);
  const executionWorkspace = provisionMissionExecutionWorkspace({
    appRoot: root,
    createdAt: "2026-04-10T11:12:13.000Z",
    executionProjectId: "alpha",
    title: "Workspace delete mission",
  });

  createMission(missionId, "session-noctis", {
    title: "Workspace delete mission",
    objective: "Exercise workspace deletion",
    executionProjectId: "alpha",
    contextProjectIds: [],
    baseBranch: executionWorkspace.baseBranch,
    branch: executionWorkspace.branch,
    workspacePath: executionWorkspace.workspacePath,
    workspaceStatus: executionWorkspace.workspaceStatus,
  });
  setWorkerSession(missionId, "ignis", "session-ignis");

  return executionWorkspace.workspacePath;
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

describe("workspace delete route", () => {
  it("deletes a clean execution workspace and clears stored sessions", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const workspacePath = createExecutionMission(root);
    const missionId = missionIds[missionIds.length - 1];
    sessionAbortMock.mockResolvedValue({ data: { ok: true } });

    const response = await workspaceAction({
      params: { missionId },
      request: new Request(`http://localhost/api/noctis/missions/${missionId}/workspace`, {
        method: "DELETE",
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(await readJson<{ deleted: boolean }>(response)).toEqual({ deleted: true });
    expect(existsSync(workspacePath)).toBe(false);
    expect(getMission(missionId)?.noctisSessionId).toBe("");
    expect(getMission(missionId)?.workerSessions).toEqual({});
    expect(getMission(missionId)?.workspaceStatus).toBe("deleted");
    expect(sessionAbortMock).toHaveBeenCalledTimes(2);
  });

  it("aborts active mission sessions and deletes a running workspace", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const workspacePath = createExecutionMission(root);
    const missionId = missionIds[missionIds.length - 1];
    const operationState = createOperationState("implement", "plan", "op://implement");
    saveOperationState(missionId, operationState);
    sessionAbortMock.mockResolvedValue({ data: { ok: true } });

    const response = await workspaceAction({
      params: { missionId },
      request: new Request(`http://localhost/api/noctis/missions/${missionId}/workspace`, {
        method: "DELETE",
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(await readJson<{ deleted: boolean }>(response)).toEqual({ deleted: true });
    expect(existsSync(workspacePath)).toBe(false);
    expect(getMission(missionId)?.operationState?.status).toBe("aborted");
    expect(sessionAbortMock).toHaveBeenCalledTimes(2);
  });

  it("deletes dirty worktrees after confirmation flow reaches the route", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const workspacePath = createExecutionMission(root);
    const missionId = missionIds[missionIds.length - 1];
    sessionAbortMock.mockResolvedValue({ data: { ok: true } });
    writeFileSync(join(workspacePath, "notes.txt"), "untracked change\n", "utf-8");

    const response = await workspaceAction({
      params: { missionId },
      request: new Request(`http://localhost/api/noctis/missions/${missionId}/workspace`, {
        method: "DELETE",
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(await readJson<{ deleted: boolean }>(response)).toEqual({ deleted: true });
    expect(existsSync(workspacePath)).toBe(false);
  });
});