import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { archiveMission, createMission, deleteMission, getMission } from "@/lib/mission-store";
import { action } from "./api.noctis.missions.bulk-delete";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-noctis-bulk-delete-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
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

describe("api.noctis.missions.bulk-delete", () => {
  it("deletes eligible archived missions and skips retained dedicated workspaces", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const directMissionId = `noctis-direct-${crypto.randomUUID()}`;
    const retainedWorkspaceMissionId = `noctis-retained-${crypto.randomUUID()}`;
    const deletedWorkspaceMissionId = `noctis-deleted-workspace-${crypto.randomUUID()}`;
    const activeMissionId = `noctis-active-${crypto.randomUUID()}`;
    const lunafreyaMissionId = `lunafreya-archived-${crypto.randomUUID()}`;
    missionIds.push(
      directMissionId,
      retainedWorkspaceMissionId,
      deletedWorkspaceMissionId,
      activeMissionId,
      lunafreyaMissionId,
    );

    createMission(directMissionId, "session-direct", {
      title: "Archived Direct Mission",
    });
    archiveMission(directMissionId);

    const retainedWorkspacePath = join(root, ".worktrees", "noctis", "retained");
    mkdirSync(retainedWorkspacePath, { recursive: true });
    createMission(retainedWorkspaceMissionId, "session-retained", {
      title: "Archived Workspace Mission",
      executionProjectId: "core-repo",
      executionTargetMode: "mission_workspace",
      workspacePath: retainedWorkspacePath,
      workspaceStatus: "ready",
    });
    archiveMission(retainedWorkspaceMissionId);

    createMission(deletedWorkspaceMissionId, "session-deleted-workspace", {
      title: "Archived Deleted Workspace Mission",
      executionProjectId: "core-repo",
      executionTargetMode: "mission_workspace",
      workspacePath: join(root, ".worktrees", "noctis", "deleted"),
      workspaceStatus: "deleted",
    });
    archiveMission(deletedWorkspaceMissionId);

    createMission(activeMissionId, "session-active", {
      title: "Active Mission",
    });

    createMission(lunafreyaMissionId, "session-luna", {
      title: "Archived Lunafreya Mission",
      primaryAgentId: "lunafreya",
      surfaceId: "lunafreya",
    });
    archiveMission(lunafreyaMissionId);

    const response = await action({
      request: new Request("http://localhost/api/noctis/missions/bulk-delete", {
        method: "DELETE",
      }),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{
      requestedCount: number;
      deletedCount: number;
      skippedCount: number;
      failedCount: number;
      deletedMissionIds: string[];
      skippedMissionIds: string[];
    }>(response);

    expect(data).toEqual({
      requestedCount: 3,
      deletedCount: 2,
      skippedCount: 1,
      failedCount: 0,
      deletedMissionIds: expect.arrayContaining([directMissionId, deletedWorkspaceMissionId]),
      skippedMissionIds: [retainedWorkspaceMissionId],
      failedMissionIds: [],
    });

    expect(getMission(directMissionId)).toBeUndefined();
    expect(getMission(deletedWorkspaceMissionId)).toBeUndefined();
    expect(getMission(retainedWorkspaceMissionId)?.status).toBe("archived");
    expect(getMission(activeMissionId)?.status).toBe("active");
    expect(getMission(lunafreyaMissionId)?.status).toBe("archived");
  });
});