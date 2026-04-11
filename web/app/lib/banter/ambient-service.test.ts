import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMission, deleteMission, getMission } from "@/lib/mission-store";

import { recordAmbientBanter } from "./ambient-service";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-ambient-service-"));
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

describe("recordAmbientBanter", () => {
  it("preserves trusted server-side createdAt values when provided directly", () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-ambient-trusted-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", {
      title: "Ambient trusted timestamp",
      objective: "Verify trusted server timestamp handling",
    });

    const entry = recordAmbientBanter({
      missionId,
      speakerAgent: "ignis",
      cue: "task-progress-early",
      renderedMessage: "Sweeping the surface area.",
      sourceEvent: "task.progress",
      createdAt: "2026-04-11T10:00:00.000Z",
    });

    expect(entry).toEqual(
      expect.objectContaining({
        createdAt: "2026-04-11T10:00:00.000Z",
      }),
    );
    expect(getMission(missionId)?.ambientBanterLog).toEqual([
      expect.objectContaining({
        createdAt: "2026-04-11T10:00:00.000Z",
      }),
    ]);
  });
});