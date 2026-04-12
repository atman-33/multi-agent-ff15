import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMission, deleteMission } from "./mission-store";
import { listManagedSessions } from "./managed-session.server";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-managed-session-"));
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

describe("managed-session.server", () => {
  it("includes the primary session for Lunafreya missions", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const noctisMission = createMission("managed-noctis", "session-noctis", {
      title: "Noctis Mission",
      executionProjectId: "alpha",
      contextProjectIds: ["beta"],
    });
    const lunafreyaMission = createMission("managed-luna", "session-luna", {
      title: "Lunafreya Mission",
      surfaceId: "lunafreya",
      primaryAgentId: "lunafreya",
      executionProjectId: "alpha",
      contextProjectIds: ["beta", "gamma"],
    });
    missionIds.push(noctisMission.id, lunafreyaMission.id);

    const sessions = listManagedSessions();

    expect(sessions["session-noctis"]).toMatchObject({
      missionId: "managed-noctis",
      ownerAgent: "noctis",
      ownerLabel: "Noctis",
    });
    expect(sessions["session-luna"]).toMatchObject({
      missionId: "managed-luna",
      ownerAgent: "lunafreya",
      ownerLabel: "Lunafreya",
      executionContext: {
        executionProjectId: "alpha",
        contextProjectIds: ["beta", "gamma"],
      },
    });
  });
});