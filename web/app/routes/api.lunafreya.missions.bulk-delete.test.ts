import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { archiveMission, createMission, deleteMission, getMission } from "@/lib/mission-store";
import { action } from "./api.lunafreya.missions.bulk-delete";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-lunafreya-bulk-delete-"));
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

describe("api.lunafreya.missions.bulk-delete", () => {
  it("limits archived bulk deletion to Lunafreya missions", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const lunafreyaMissionId = `lunafreya-direct-${crypto.randomUUID()}`;
    const noctisMissionId = `noctis-direct-${crypto.randomUUID()}`;
    missionIds.push(lunafreyaMissionId, noctisMissionId);

    createMission(lunafreyaMissionId, "session-luna", {
      title: "Archived Lunafreya Mission",
      primaryAgentId: "lunafreya",
      surfaceId: "lunafreya",
    });
    archiveMission(lunafreyaMissionId);

    createMission(noctisMissionId, "session-noctis", {
      title: "Archived Noctis Mission",
    });
    archiveMission(noctisMissionId);

    const response = await action({
      request: new Request("http://localhost/api/lunafreya/missions/bulk-delete", {
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
    }>(response);

    expect(data).toEqual({
      requestedCount: 1,
      deletedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      deletedMissionIds: [lunafreyaMissionId],
      skippedMissionIds: [],
      failedMissionIds: [],
    });

    expect(getMission(lunafreyaMissionId)).toBeUndefined();
    expect(getMission(noctisMissionId)?.status).toBe("archived");
  });
});