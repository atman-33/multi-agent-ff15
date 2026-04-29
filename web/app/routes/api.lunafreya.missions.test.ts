import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMission, deleteMission, updateMissionMetadata } from "@/lib/mission-store";
import { loader } from "./api.lunafreya.missions";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-lunafreya-missions-route-"));
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

describe("api.lunafreya.missions", () => {
  it("returns the selected Lunafreya mission view with shared active and archived counts", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const activeMissionId = `luna-active-${crypto.randomUUID()}`;
    const archivedMissionId = `luna-archived-${crypto.randomUUID()}`;
    const noctisMissionId = `noctis-${crypto.randomUUID()}`;
    missionIds.push(activeMissionId, archivedMissionId, noctisMissionId);

    createMission(activeMissionId, "session-luna-active", {
      primaryAgentId: "lunafreya",
      surfaceId: "lunafreya",
      title: "Lunafreya Active",
    });
    createMission(archivedMissionId, "session-luna-archived", {
      primaryAgentId: "lunafreya",
      surfaceId: "lunafreya",
      title: "Lunafreya Archived",
    });
    updateMissionMetadata(archivedMissionId, { status: "archived" });
    createMission(noctisMissionId, "session-noctis", {
      title: "Noctis Mission",
    });

    const response = await loader({
      request: new Request("http://localhost/api/lunafreya/missions?view=archived"),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{
      counts: { active: number; archived: number };
      missions: Array<{ missionId: string; title: string; status: string }>;
    }>(response);

    expect(data.counts).toEqual({ active: 1, archived: 1 });
    expect(data.missions).toEqual([
      expect.objectContaining({
        missionId: archivedMissionId,
        status: "archived",
        title: "Lunafreya Archived",
      }),
    ]);
  });
});
