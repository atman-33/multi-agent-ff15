import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  createMission,
  deleteMission,
  getMission,
} from "@/lib/mission-store";
import { provisionMissionExecutionWorkspace } from "@/lib/mission-execution-workspace.server";

import { action as contextAction } from "./api.noctis.missions.$missionId.context";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const repoRoot = getProjectRoot();

function initializeGitProject(projectRoot: string, label: string): void {
  writeFileSync(join(projectRoot, "AGENTS.md"), `# ${label}\n`, "utf-8");
  writeFileSync(join(projectRoot, "README.md"), `# ${label}\n`, "utf-8");
  execSync("git init -b main", { cwd: projectRoot, stdio: "ignore" });
  execSync('git config user.email "test@example.com"', { cwd: projectRoot, stdio: "ignore" });
  execSync('git config user.name "Test User"', { cwd: projectRoot, stdio: "ignore" });
  execSync("git add README.md AGENTS.md", { cwd: projectRoot, stdio: "ignore" });
  execSync('git commit -m "init"', { cwd: projectRoot, stdio: "ignore" });
}

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-context-route-"));
  tempRoots.push(root);
  cpSync(join(repoRoot, "builtins"), join(root, "builtins"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "projects", "alpha"), { recursive: true });
  mkdirSync(join(root, "projects", "beta"), { recursive: true });
  mkdirSync(join(root, "external-alpha"), { recursive: true });
  mkdirSync(join(root, "external-beta"), { recursive: true });
  initializeGitProject(join(root, "external-alpha"), "Alpha");
  initializeGitProject(join(root, "external-beta"), "Beta");

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
      'updated_at: "2026-04-10T00:00:00.000Z"',
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
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(root, "projects", "beta", "project.yaml"),
    [
      'id: "beta"',
      'name: "Beta Project"',
      'root_path: "../../external-beta"',
      'default_base_branch: "main"',
      'serena_project: "beta"',
      "",
    ].join("\n"),
    "utf-8",
  );

  return root;
}

function createLegacyMission() {
  const missionId = `mission-${crypto.randomUUID()}`;
  missionIds.push(missionId);
  return createMission(missionId, "session-legacy", {
    title: "Legacy mission",
    objective: "Needs execution assignment",
    contextProjectIds: [],
  });
}

function createAssignedMission(root: string) {
  const missionId = `mission-${crypto.randomUUID()}`;
  missionIds.push(missionId);
  const executionWorkspace = provisionMissionExecutionWorkspace({
    appRoot: root,
    createdAt: "2026-04-10T11:12:13.000Z",
    executionProjectId: "alpha",
    title: "Assigned mission",
  });
  return createMission(missionId, "session-alpha", {
    title: "Assigned mission",
    objective: "Already assigned",
    executionProjectId: "alpha",
    contextProjectIds: ["beta"],
    baseBranch: executionWorkspace.baseBranch,
    branch: executionWorkspace.branch,
    workspacePath: executionWorkspace.workspacePath,
    workspaceStatus: executionWorkspace.workspaceStatus,
  });
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

afterEach(() => {
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

describe("mission context route", () => {
  it("assigns an execution project to a legacy mission and provisions its workspace", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const mission = createLegacyMission();

    const response = await contextAction({
      params: { missionId: mission.id },
      request: new Request(`http://localhost/api/noctis/missions/${mission.id}/context`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executionProjectId: "alpha",
          contextProjectIds: ["beta", "alpha", "beta"],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(await readJson<{ missionId: string }>(response)).toEqual({ missionId: mission.id });
    expect(getMission(mission.id)?.executionProjectId).toBe("alpha");
    expect(getMission(mission.id)?.contextProjectIds).toEqual(["beta"]);
    expect(getMission(mission.id)?.branch).toMatch(/^mission\//);
    expect(existsSync(getMission(mission.id)?.workspacePath ?? "")).toBe(true);
    expect(getMission(mission.id)?.workspaceStatus).toBe("ready");
    expect(getMission(mission.id)?.noctisSessionId).toBe("");
    expect(getMission(mission.id)?.activityLog.at(-1)?.body).toContain("Assigned execution project");
  });

  it("updates mission context projects and records an activity log entry", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const mission = createAssignedMission(root);

    const response = await contextAction({
      params: { missionId: mission.id },
      request: new Request(`http://localhost/api/noctis/missions/${mission.id}/context`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextProjectIds: ["beta", "beta", "alpha", "missing"],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(getMission(mission.id)?.contextProjectIds).toEqual(["beta"]);
    expect(getMission(mission.id)?.activityLog.at(-1)?.body).toContain("Updated mission context projects");
  });

  it("rejects changing the execution project after assignment", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const mission = createAssignedMission(root);

    const response = await contextAction({
      params: { missionId: mission.id },
      request: new Request(`http://localhost/api/noctis/missions/${mission.id}/context`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executionProjectId: "beta",
          contextProjectIds: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(409);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: "Execution project cannot be changed after mission creation.",
    });
    expect(getMission(mission.id)?.executionProjectId).toBe("alpha");
  });
});