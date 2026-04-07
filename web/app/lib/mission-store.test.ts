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