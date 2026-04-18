import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildMissionExecutionBranchName,
  resolveExecutionBaseBranch,
  resolveManagedMissionStartRoots,
  resolveExecutionWorkspaceBaseDir,
  resolveMissionWorkspacePath,
} from "./mission-execution-workspace.server";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-mission-execution-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("mission-execution-workspace.server", () => {
  it("derives canonical branch names and workspace paths", () => {
    const createdAt = "2026-04-10T11:12:13.000Z";

    expect(buildMissionExecutionBranchName(createdAt, "Implement Shared Clone Workspace")).toBe(
      "mission/20260410-111213-implement-shared-clone-workspace",
    );
    expect(
      resolveMissionWorkspacePath({
        appRoot: "/tmp/multi-agent-ff15",
        executionProjectId: "alpha",
        createdAt,
        title: "Implement Shared Clone Workspace",
      }),
    ).toBe("/tmp/.worktrees/alpha/20260410-111213-implement-shared-clone-workspace");
  });

  it("honors configured workspace root overrides", () => {
    expect(resolveExecutionWorkspaceBaseDir("/tmp/multi-agent-ff15", "../custom-workspaces")).toBe(
      "/tmp/custom-workspaces",
    );
    expect(
      resolveMissionWorkspacePath({
        appRoot: "/tmp/multi-agent-ff15",
        executionProjectId: "alpha",
        createdAt: "2026-04-10T11:12:13.000Z",
        title: "Implement Shared Clone Workspace",
        workspaceRootOverride: "/var/tmp/workspaces",
      }),
    ).toBe("/var/tmp/workspaces/alpha/20260410-111213-implement-shared-clone-workspace");
  });

  it("resolves the base branch from project defaults and local git state", () => {
    const repoRoot = createTempRoot();

    execSync("git init -b trunk", { cwd: repoRoot, stdio: "ignore" });
    execSync('git config user.email "test@example.com"', { cwd: repoRoot, stdio: "ignore" });
    execSync('git config user.name "Test User"', { cwd: repoRoot, stdio: "ignore" });
    writeFileSync(join(repoRoot, "README.md"), "# test\n", "utf-8");
    execSync("git add README.md", { cwd: repoRoot, stdio: "ignore" });
    execSync('git commit -m "init"', { cwd: repoRoot, stdio: "ignore" });

    expect(resolveExecutionBaseBranch({ rootPath: repoRoot, defaultBaseBranch: "release" })).toBe(
      "release",
    );
    expect(resolveExecutionBaseBranch({ rootPath: repoRoot })).toBe("trunk");
  });

  it("separates the managed session host root from the execution target root", () => {
    const executionProject = {
      id: "alpha",
      name: "Alpha Project",
      rootPath: "/tmp/external-alpha",
      serenaProject: "alpha",
      instructionFiles: [],
    };

    expect(
      resolveManagedMissionStartRoots({
        appRoot: "/tmp/multi-agent-ff15",
        executionProject,
        executionTargetMode: "execution_project",
      }),
    ).toMatchObject({
      sessionHostRoot: "/tmp/multi-agent-ff15",
      executionRoot: "/tmp/external-alpha",
      executionTargetMode: "execution_project",
      recreated: false,
    });

    expect(
      resolveManagedMissionStartRoots({
        appRoot: "/tmp/multi-agent-ff15",
        executionProject,
        executionTargetMode: "mission_workspace",
        executionWorkspace: {
          workspacePath: "/tmp/.worktrees/alpha/mission-123",
          workspaceStatus: "ready",
        },
      }),
    ).toMatchObject({
      sessionHostRoot: "/tmp/multi-agent-ff15",
      executionRoot: "/tmp/.worktrees/alpha/mission-123",
      executionTargetMode: "mission_workspace",
      workspacePath: "/tmp/.worktrees/alpha/mission-123",
      workspaceStatus: "ready",
      recreated: false,
    });
  });
});