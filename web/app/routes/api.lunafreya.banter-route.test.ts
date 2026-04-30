import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMission, deleteMission, getMission } from "@/lib/mission-store";
import { action } from "./api.lunafreya.missions.$missionId.banter";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-lunafreya-banter-route-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

afterEach(() => {
  vi.useRealTimers();

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

describe("api.lunafreya.missions.$missionId.banter", () => {
  it("records Lunafreya ambient banter entries for the mission timeline", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-luna-banter-route-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-lunafreya", {
      title: "Lunafreya ambient banter",
      objective: "Verify Lunafreya ambient banter route",
      primaryAgentId: "lunafreya",
      surfaceId: "lunafreya",
    });

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakerAgent: "lunafreya",
          cue: "session-settled",
          sourceEvent: "session.settled",
          createdAt: "2026-04-11T12:00:00.000Z",
        }),
      }),
      params: { missionId },
    } as never);

    expect(response.status).toBe(200);
    await expect(
      readJson<{
        recorded: boolean;
        entry: { kind: "ambient"; cue: string; speakerAgent: string; renderedMessage: string } | null;
      }>(response),
    ).resolves.toEqual({
      recorded: true,
      entry: expect.objectContaining({
        kind: "ambient",
        cue: "session-settled",
        speakerAgent: "lunafreya",
        renderedMessage: expect.stringMatching(/\S/),
      }),
    });
    expect(getMission(missionId)?.ambientBanterLog).toEqual([
      expect.objectContaining({
        speakerAgent: "lunafreya",
        cue: "session-settled",
        payload: expect.objectContaining({
          sourceEvent: "session.settled",
        }),
      }),
    ]);
  });
});