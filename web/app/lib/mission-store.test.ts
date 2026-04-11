import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createMission,
  deleteMission,
  getMission,
  getMissionFilePath,
  listMissionSummaries,
} from "./mission-store";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-mission-store-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
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

describe("mission store", () => {
  it("persists missions under mission-scoped directories", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const mission = createMission("mission-canonical", "session-1", {
      title: "Canonical Mission",
      objective: "Verify mission persistence",
    });
    missionIds.push(mission.id);

    const missionFilePath = getMissionFilePath(mission.id);
    expect(missionFilePath).toContain("runtime/noctis-missions/mission-canonical/mission.json");
    expect(existsSync(missionFilePath)).toBe(true);

    deleteMission(mission.id);

    const reloaded = getMission(mission.id);
    expect(reloaded?.id).toBe(mission.id);
    expect(reloaded?.title).toBe("Canonical Mission");
  });

  it("persists execution workspace metadata and stable-deduped context projects", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const mission = createMission("mission-execution", "session-execution", {
      title: "Execution Mission",
      objective: "Verify execution metadata",
      executionProjectId: "alpha",
      contextProjectIds: ["beta", "alpha", "beta", "gamma"],
      baseBranch: "main",
      branch: "mission/20260410-111213-execution-mission",
      workspacePath: "/tmp/.worktrees/alpha/20260410-111213-execution-mission",
      workspaceStatus: "ready",
    });
    missionIds.push(mission.id);

    expect(mission.contextProjectIds).toEqual(["beta", "gamma"]);
    expect(mission.executionProjectId).toBe("alpha");

    deleteMission(mission.id);

    const reloaded = getMission(mission.id);
    expect(reloaded?.executionProjectId).toBe("alpha");
    expect(reloaded?.contextProjectIds).toEqual(["beta", "gamma"]);
    expect(reloaded?.baseBranch).toBe("main");
    expect(reloaded?.branch).toBe("mission/20260410-111213-execution-mission");
    expect(reloaded?.workspacePath).toBe(
      "/tmp/.worktrees/alpha/20260410-111213-execution-mission",
    );
    expect(reloaded?.workspaceStatus).toBe("ready");
  });

  it("reads legacy missions without execution metadata", () => {
    const root = createTempRoot();
    const missionId = "legacy-execution";
    process.env.MULTI_AGENT_FF15_ROOT = root;

    mkdirSync(join(root, "runtime", "noctis-missions", missionId), { recursive: true });
    writeFileSync(
      join(root, "runtime", "noctis-missions", missionId, "mission.json"),
      JSON.stringify({
        id: missionId,
        noctisSessionId: "session-legacy",
        workerSessions: {},
        allowedWorkers: [],
        taskGraph: [],
        delegationLedger: {
          missionId,
          activeTasks: [],
          completedSummaries: {},
        },
        agentModels: {},
        createdAt: "2026-04-10T00:00:00.000Z",
        updatedAt: "2026-04-10T00:00:00.000Z",
        title: "Legacy Mission",
        status: "active",
        messageLog: [],
        activityLog: [],
      }),
      "utf-8",
    );

    const mission = getMission(missionId);
    missionIds.push(missionId);

    expect(mission?.executionProjectId).toBeUndefined();
    expect(mission?.contextProjectIds).toEqual([]);
    expect(mission?.baseBranch).toBeUndefined();
    expect(mission?.branch).toBeUndefined();
    expect(mission?.workspacePath).toBeUndefined();
    expect(mission?.workspaceStatus).toBeUndefined();
  });

  it("defaults existing execution-backed missions to mission_workspace mode", () => {
    const root = createTempRoot();
    const missionId = "legacy-execution-mode";
    process.env.MULTI_AGENT_FF15_ROOT = root;

    mkdirSync(join(root, "runtime", "noctis-missions", missionId), { recursive: true });
    writeFileSync(
      join(root, "runtime", "noctis-missions", missionId, "mission.json"),
      JSON.stringify({
        id: missionId,
        noctisSessionId: "session-legacy",
        workerSessions: {},
        executionProjectId: "alpha",
        contextProjectIds: [],
        branch: "mission/20260410-legacy-execution-mode",
        baseBranch: "main",
        workspacePath: "/tmp/worktrees/alpha/legacy-execution-mode",
        workspaceStatus: "ready",
        allowedWorkers: [],
        taskGraph: [],
        delegationLedger: {
          missionId,
          activeTasks: [],
          completedSummaries: {},
        },
        agentModels: {},
        createdAt: "2026-04-10T00:00:00.000Z",
        updatedAt: "2026-04-10T00:00:00.000Z",
        title: "Legacy Execution Mode Mission",
        status: "active",
        messageLog: [],
        activityLog: [],
      }),
      "utf-8",
    );

    const mission = getMission(missionId);
    missionIds.push(missionId);

    expect(mission?.executionTargetMode).toBe("mission_workspace");
  });

  it("lists canonical mission directories and ignores legacy flat files", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const mission = createMission("mission-listed", "session-2", {
      title: "Listed Mission",
    });
    missionIds.push(mission.id);

    writeFileSync(
      join(root, "runtime", "noctis-missions", "legacy-flat.json"),
      JSON.stringify({
        id: "legacy-flat",
        noctisSessionId: "session-legacy",
        workerSessions: {},
        taskGraph: [],
        delegationLedger: {
          missionId: "legacy-flat",
          activeTasks: [],
          completedSummaries: {},
        },
        agentModels: {},
        createdAt: "2026-04-03T00:00:00.000Z",
        updatedAt: "2026-04-03T00:00:00.000Z",
        title: "Legacy Flat Mission",
        status: "active",
        messageLog: [],
        activityLog: [],
      }),
      "utf-8",
    );

    deleteMission(mission.id);

    expect(getMission("legacy-flat")).toBeUndefined();
    expect(listMissionSummaries({ view: "all" })).toEqual([
      expect.objectContaining({ missionId: "mission-listed", title: "Listed Mission" }),
    ]);
  });
});