import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMission, deleteMission, getMission } from "@/lib/mission-store";
import { action } from "./api.noctis.missions.$missionId.banter";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-banter-route-"));
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

describe("api.noctis.missions.$missionId.banter", () => {
  it("records ambient banter entries for the mission timeline", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-banter-route-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", {
      title: "Ambient banter",
      objective: "Verify ambient banter route",
    });

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakerAgent: "ignis",
          cue: "task-progress-early",
          renderedMessage: "関連箇所を洗っている。",
          sourceEvent: "task.progress",
          createdAt: "2026-04-11T10:00:00.000Z",
        }),
      }),
      params: { missionId },
    } as never);

    expect(response.status).toBe(200);
    await expect(
      readJson<{
        recorded: boolean;
        entry: { kind: "ambient"; cue: string; renderedMessage: string } | null;
      }>(response)
    ).resolves.toEqual({
      recorded: true,
      entry: expect.objectContaining({
        kind: "ambient",
        cue: "task-progress-early",
        renderedMessage: "関連箇所を洗っている。",
      }),
    });
    expect(getMission(missionId)?.ambientBanterLog).toEqual([
      expect.objectContaining({
        kind: "ambient",
        speakerAgent: "ignis",
        cue: "task-progress-early",
        renderedMessage: "関連箇所を洗っている。",
        payload: expect.objectContaining({
          sourceEvent: "task.progress",
        }),
      }),
    ]);
  });

  it("suppresses near-duplicate ambient banter entries", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-banter-dedupe-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", {
      title: "Ambient banter dedupe",
      objective: "Verify duplicate suppression",
    });

    const createRequest = (createdAt: string) =>
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakerAgent: "noctis",
          cue: "session-settled",
          renderedMessage: "ひとまず片付いたな。次の指示を待つ。",
          sourceEvent: "session.settled",
          createdAt,
        }),
      });

    const first = await action({ request: createRequest("2026-04-11T10:00:00.000Z"), params: { missionId } } as never);
    const second = await action({ request: createRequest("2026-04-11T10:00:10.000Z"), params: { missionId } } as never);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(
      readJson<{ recorded: boolean; entry: unknown }>(second)
    ).resolves.toEqual({ recorded: false, entry: null });
    expect(getMission(missionId)?.ambientBanterLog).toHaveLength(1);
  });

  it("assigns canonical createdAt at record time for client-origin ambient banter", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T11:11:11.000Z"));

    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-banter-client-created-at-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", {
      title: "Ambient canonical timestamp",
      objective: "Verify client timestamps are not canonical",
    });

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakerAgent: "noctis",
          cue: "session-settled",
          renderedMessage: "Settled now.",
          sourceEvent: "session.settled",
          createdAt: "2026-04-11T09:00:00.000Z",
        }),
      }),
      params: { missionId },
    } as never);

    expect(response.status).toBe(200);
    expect(getMission(missionId)?.ambientBanterLog).toEqual([
      expect.objectContaining({
        createdAt: "2026-04-11T11:11:11.000Z",
      }),
    ]);
  });
});
