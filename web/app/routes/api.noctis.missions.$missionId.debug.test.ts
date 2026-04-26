import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getNoctisMissionRuntimeDebugLogPath } from "@/lib/noctis-mission-runtime-debug.server";
import { action } from "./api.noctis.missions.$missionId.debug";

const tempRoots: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-noctis-runtime-debug-route-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

afterEach(() => {
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

describe("api.noctis.missions.$missionId.debug", () => {
  it("records client runtime debug events to the JSONL log", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "client-hook",
          event: "settled-evaluation",
          stage: "observed",
          sessionId: "session-1",
          payload: {
            previousSettled: false,
            nextSettled: true,
            activeTaskCount: 0,
          },
        }),
      }),
      params: { missionId: "mission-1" },
    } as never);

    expect(response.status).toBe(200);
    await expect(readJson<{ recorded: boolean }>(response)).resolves.toEqual({ recorded: true });

    const entries = readFileSync(getNoctisMissionRuntimeDebugLogPath(), "utf-8")
      .trim()
      .split(/\r?\n/);
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0] ?? "{}")).toMatchObject({
      source: "client-hook",
      event: "settled-evaluation",
      stage: "observed",
      missionId: "mission-1",
      sessionId: "session-1",
      payload: {
        previousSettled: false,
        nextSettled: true,
        activeTaskCount: 0,
      },
    });
  });

  it("rejects unknown client event names", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "client-hook",
          event: "unknown-event",
          stage: "observed",
        }),
      }),
      params: { missionId: "mission-1" },
    } as never);

    expect(response.status).toBe(400);
    await expect(readJson<{ error: string }>(response)).resolves.toEqual({
      error: "Invalid event",
    });
  });
});