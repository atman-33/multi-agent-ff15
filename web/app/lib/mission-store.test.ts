import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createMission,
  deleteMission,
  getMissionPrimaryAgentId,
  getMissionPrimarySessionId,
  getMissionSurfaceId,
  getMission,
  getMissionFilePath,
  hardDeleteMission,
  listMissionSummaries,
  setWorkerSession,
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

  it("hard deletes persisted mission data from disk", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const mission = createMission("mission-hard-delete", "session-hard-delete", {
      title: "Disposable Mission",
      objective: "Verify permanent deletion",
    });
    missionIds.push(mission.id);

    const missionFilePath = getMissionFilePath(mission.id);
    expect(existsSync(missionFilePath)).toBe(true);

    hardDeleteMission(mission.id);

    expect(existsSync(missionFilePath)).toBe(false);
    expect(getMission(mission.id)).toBeUndefined();
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

  it("persists transport snapshots and primary session ownership metadata", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const mission = createMission("mission-transport-state", "session-primary-owner", {
      title: "Transport State Mission",
      objective: "Verify transport snapshot persistence",
    });
    missionIds.push(mission.id);

    expect(mission.transportMode).toBe("app-owned");
    expect(mission.sessionOwners).toEqual({
      "session-primary-owner": "noctis",
    });

    deleteMission(mission.id);

    const reloaded = getMission(mission.id);
    expect(reloaded?.transportMode).toBe("app-owned");
    expect(reloaded?.sessionOwners).toEqual({
      "session-primary-owner": "noctis",
    });
  });

  it("persists Lunafreya mission surface metadata and facet selections", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const mission = createMission("mission-lunafreya", "session-luna-1", {
      title: "Oracle Mission",
      objective: "Verify Lunafreya mission persistence",
      surfaceId: "lunafreya",
      primaryAgentId: "lunafreya",
      lunafreyaFacetSelection: {
        selectedJobId: "builtin:ja:jobs/reviewer.md",
        selectedSkillIds: [
          "builtin:ja:skills/agent-relationships",
          "project:alpha:skills/domain-notes",
        ],
        updatedAt: "2026-04-12T10:00:00.000Z",
      },
    });
    missionIds.push(mission.id);

    expect(getMissionSurfaceId(mission)).toBe("lunafreya");
    expect(getMissionPrimaryAgentId(mission)).toBe("lunafreya");
    expect(getMissionPrimarySessionId(mission)).toBe("session-luna-1");
    expect(mission.lunafreyaFacetSelection).toEqual({
      selectedJobId: "builtin:ja:jobs/reviewer.md",
      selectedSkillIds: [
        "builtin:ja:skills/agent-relationships",
        "project:alpha:skills/domain-notes",
      ],
      updatedAt: "2026-04-12T10:00:00.000Z",
    });

    deleteMission(mission.id);

    const reloaded = getMission(mission.id);
    expect(reloaded).toBeDefined();
    expect(getMissionSurfaceId(reloaded)).toBe("lunafreya");
    expect(getMissionPrimaryAgentId(reloaded)).toBe("lunafreya");
    expect(getMissionPrimarySessionId(reloaded)).toBe("session-luna-1");
    expect(reloaded?.lunafreyaFacetSelection).toEqual({
      selectedJobId: "builtin:ja:jobs/reviewer.md",
      selectedSkillIds: [
        "builtin:ja:skills/agent-relationships",
        "project:alpha:skills/domain-notes",
      ],
      updatedAt: "2026-04-12T10:00:00.000Z",
    });
  });

  it("derives shared mission accessors from legacy Noctis missions", () => {
    const root = createTempRoot();
    const missionId = "legacy-noctis-accessors";
    process.env.MULTI_AGENT_FF15_ROOT = root;

    mkdirSync(join(root, "runtime", "noctis-missions", missionId), { recursive: true });
    writeFileSync(
      join(root, "runtime", "noctis-missions", missionId, "mission.json"),
      JSON.stringify({
        id: missionId,
        noctisSessionId: "session-legacy-noctis",
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
        title: "Legacy Noctis Mission",
        status: "active",
        messageLog: [],
        activityLog: [],
      }),
      "utf-8",
    );

    const mission = getMission(missionId);
    missionIds.push(missionId);

    expect(getMissionSurfaceId(mission)).toBe("noctis_team");
    expect(getMissionPrimaryAgentId(mission)).toBe("noctis");
    expect(getMissionPrimarySessionId(mission)).toBe("session-legacy-noctis");
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

  it("ignores owned-session transport directories without mission.json", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const mission = createMission("mission-listed-with-owned-session-dir", "session-3", {
      title: "Listed Mission",
    });
    missionIds.push(mission.id);

    mkdirSync(
      join(
        root,
        "runtime",
        "noctis-missions",
        "owned-session-ses_22175d7e6ffea4hkNLJZosfeTc",
      ),
      { recursive: true },
    );

    expect(listMissionSummaries({ view: "all" })).toEqual([
      expect.objectContaining({
        missionId: "mission-listed-with-owned-session-dir",
        title: "Listed Mission",
      }),
    ]);
  });

  it("flattens primary and worker activity session ids into mission summaries", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const mission = createMission("mission-running-summary", "session-primary", {
      title: "Running Summary Mission",
    });
    missionIds.push(mission.id);

    setWorkerSession(mission.id, "ignis", "session-ignis");
    setWorkerSession(mission.id, "prompto", "session-prompto");

    expect(listMissionSummaries({ view: "all" })).toEqual([
      expect.objectContaining({
        missionId: "mission-running-summary",
        activitySessionIds: ["session-primary", "session-ignis", "session-prompto"],
      }),
    ]);
  });

  it("persists lazy worker session ownership metadata only after the worker session is created", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const mission = createMission("mission-worker-owners", "session-primary", {
      title: "Worker ownership mission",
      objective: "Verify lazy worker ownership persistence",
    });
    missionIds.push(mission.id);

    expect(mission.sessionOwners).toEqual({
      "session-primary": "noctis",
    });

    setWorkerSession(mission.id, "ignis", "session-ignis");

    expect(getMission(mission.id)?.sessionOwners).toEqual({
      "session-primary": "noctis",
      "session-ignis": "ignis",
    });

    deleteMission(mission.id);

    expect(getMission(mission.id)?.sessionOwners).toEqual({
      "session-primary": "noctis",
      "session-ignis": "ignis",
    });
  });
});