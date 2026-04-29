import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  TMUX_ACTIVE_MISSION_STATE_FILE,
  clearTmuxActiveMission,
  readTmuxActiveMission,
  writeTmuxActiveMission,
} from "./tmux-active-mission.server";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-tmux-active-mission-"));
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

describe("tmux-active-mission.server", () => {
  it("returns null when no writable tmux mission has been activated", () => {
    const root = createTempRoot();

    expect(readTmuxActiveMission(root)).toBeNull();
  });

  it("persists and reads back one writable active tmux mission", () => {
    const root = createTempRoot();

    writeTmuxActiveMission(root, {
      missionId: "mission-alpha",
      updatedAt: "2026-04-29T00:00:00.000Z",
    });

    expect(readTmuxActiveMission(root)).toEqual({
      missionId: "mission-alpha",
      updatedAt: "2026-04-29T00:00:00.000Z",
    });

    const filePath = join(root, "runtime", TMUX_ACTIVE_MISSION_STATE_FILE);
    expect(existsSync(filePath)).toBe(true);
    expect(JSON.parse(readFileSync(filePath, "utf-8"))).toMatchObject({
      missionId: "mission-alpha",
      updatedAt: "2026-04-29T00:00:00.000Z",
      version: 1,
    });
  });

  it("clears the writable active tmux mission state", () => {
    const root = createTempRoot();

    writeTmuxActiveMission(root, {
      missionId: "mission-alpha",
      updatedAt: "2026-04-29T00:00:00.000Z",
    });

    clearTmuxActiveMission(root);

    expect(readTmuxActiveMission(root)).toBeNull();
    expect(existsSync(join(root, "runtime", TMUX_ACTIVE_MISSION_STATE_FILE))).toBe(false);
  });
});