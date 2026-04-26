import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { APP_ROOT_EXECUTION_PROJECT_ID } from "@/lib/execution-context";
import { createMission, deleteMission } from "@/lib/mission-store";
import { saveSessionExecutionContext } from "@/lib/session-execution-context.server";

import { buildSharedPromptContext } from "./index";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-common-context-"));
  tempRoots.push(root);
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "projects"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  writeFileSync(join(root, "config", "settings.yaml"), "language: ja\n", "utf-8");
  return root;
}

function writeProject(root: string, projectId: string): string {
  const projectRoot = join(root, `external-${projectId}`);
  mkdirSync(join(root, "projects", projectId), { recursive: true });
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(join(projectRoot, "AGENTS.md"), `# ${projectId}\n`, "utf-8");
  writeFileSync(
    join(root, "projects", projectId, "project.yaml"),
    [
      `id: "${projectId}"`,
      `name: "${projectId}"`,
      `root_path: "../../external-${projectId}"`,
      `serena_project: "${projectId}"`,
      "instruction_files:",
      `  - path: "../../external-${projectId}/AGENTS.md"`,
      "    enabled: true",
      "",
    ].join("\n"),
    "utf-8",
  );
  return projectRoot;
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

describe("common-context.server", () => {
  it("uses app-root execution context for generic sessions without sidecar state", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeFileSync(join(root, "AGENTS.md"), "# Root Agents\n", "utf-8");

    const context = buildSharedPromptContext({
      appRoot: root,
      agent: "noctis",
      sessionId: "session-legacy",
    });

    expect(context).toContain(`project_root: ${root}`);
    expect(context).toContain(`instruction_files:\n  - ${root}/AGENTS.md`);
    expect(context).toContain(`activate_project: ${root}`);
    expect(context).toContain(`openspec_root: ${root}`);
  });

  it("uses session-local execution-context sidecar for generic sessions", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const alphaRoot = writeProject(root, "alpha");
    const betaRoot = writeProject(root, "beta");
    saveSessionExecutionContext("session-generic", {
      executionProjectId: "alpha",
      contextProjectIds: ["beta", "alpha", "beta"],
    });

    const context = buildSharedPromptContext({
      appRoot: root,
      agent: "noctis",
      sessionId: "session-generic",
    });

    expect(context).toContain(`project_root: ${alphaRoot}`);
    expect(context).toContain(`    project_root: ${betaRoot}`);
    expect(context.indexOf(`project_root: ${alphaRoot}`)).toBeLessThan(
      context.indexOf(`    project_root: ${betaRoot}`),
    );
    expect(context).toContain(`serena_project: alpha`);
  });

  it("uses mission-scoped execution and context projects instead of live presets", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const alphaRoot = writeProject(root, "alpha");
    const betaRoot = writeProject(root, "beta");
    const gammaRoot = writeProject(root, "gamma");
    const executionRoot = join(root, ".worktrees", "alpha", "mission-alpha");
    mkdirSync(executionRoot, { recursive: true });
    writeFileSync(join(executionRoot, "AGENTS.md"), "# alpha clone\n", "utf-8");

    writeFileSync(
      join(root, "config", "current_projects.yaml"),
      [
        "project_scopes:",
        "  noctis_team:",
        "    active_project_ids:",
        '      - "alpha"',
        '      - "gamma"',
        "  lunafreya:",
        "    active_project_ids: []",
        'updated_at: "2026-04-10T00:00:00.000Z"',
        'updated_by: "test"',
        "",
      ].join("\n"),
      "utf-8",
    );

    const mission = createMission(`mission-${crypto.randomUUID()}`, "session-noctis", {
      title: "Mission context",
      objective: "Use mission-scoped project context",
      executionProjectId: "alpha",
      contextProjectIds: ["beta"],
      branch: "mission/20260410-000000-mission-context",
      baseBranch: "main",
      workspacePath: executionRoot,
      workspaceStatus: "ready",
    });
    missionIds.push(mission.id);

    const context = buildSharedPromptContext({
      appRoot: root,
      agent: "noctis",
      missionId: mission.id,
      sessionId: "session-noctis",
    });

    expect(context).toContain(`project_root: ${executionRoot}`);
    expect(context).toContain(`    project_root: ${betaRoot}`);
    expect(context).not.toContain(`project_root: ${alphaRoot}`);
    expect(context).not.toContain(`project_root: ${gammaRoot}`);
    expect(context.indexOf(`project_root: ${executionRoot}`)).toBeLessThan(
      context.indexOf(`    project_root: ${betaRoot}`),
    );
    expect(context).toContain(`activate_project: ${executionRoot}`);
    expect(context).toContain(`openspec_root: ${executionRoot}`);
  });

  it("uses the execution project root for direct-mode missions without workspace metadata", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const alphaRoot = writeProject(root, "alpha");
    const betaRoot = writeProject(root, "beta");

    const mission = createMission(`mission-${crypto.randomUUID()}`, "session-noctis", {
      title: "Direct mission context",
      objective: "Use the execution project directly",
      executionProjectId: "alpha",
      executionTargetMode: "execution_project",
      contextProjectIds: ["beta"],
    });
    missionIds.push(mission.id);

    const context = buildSharedPromptContext({
      appRoot: root,
      agent: "noctis",
      missionId: mission.id,
      sessionId: "session-noctis",
    });

    expect(context).toContain(`project_root: ${alphaRoot}`);
    expect(context).toContain(`    project_root: ${betaRoot}`);
    expect(context).toContain(`activate_project: ${alphaRoot}`);
    expect(context).toContain(`openspec_root: ${alphaRoot}`);
  });

  it("prefers mission execution metadata over app-root session sidecar context", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const alphaRoot = writeProject(root, "alpha");
    const betaRoot = writeProject(root, "beta");
    writeFileSync(join(root, "AGENTS.md"), "# Root Agents\n", "utf-8");
    saveSessionExecutionContext("session-noctis", {
      executionProjectId: APP_ROOT_EXECUTION_PROJECT_ID,
      contextProjectIds: [],
    });

    const mission = createMission(`mission-${crypto.randomUUID()}`, "session-noctis", {
      title: "Cross-project managed mission",
      objective: "Keep execution targeting anchored to mission metadata",
      executionProjectId: "alpha",
      executionTargetMode: "execution_project",
      contextProjectIds: ["beta"],
    });
    missionIds.push(mission.id);

    const context = buildSharedPromptContext({
      appRoot: root,
      agent: "noctis",
      missionId: mission.id,
      sessionId: "session-noctis",
    });

    expect(context).toContain(`project_root: ${alphaRoot}`);
    expect(context).toContain(`    project_root: ${betaRoot}`);
    expect(context).toContain(`activate_project: ${alphaRoot}`);
    expect(context).toContain(`openspec_root: ${alphaRoot}`);
    expect(context).not.toContain(`project_root: ${root}\n`);
    expect(context).not.toContain(
      `<tooling-context>\nactivate_project: ${root}\nopenspec_root: ${root}`,
    );
  });
});