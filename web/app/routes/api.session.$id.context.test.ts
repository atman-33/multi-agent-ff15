import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMission, deleteMission, setWorkerSession } from "@/lib/mission-store";
import { readSessionExecutionContext, saveSessionExecutionContext } from "@/lib/session-execution-context.server";
import { action } from "./api.session.$id.context";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-api-session-context-"));
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

describe("api.session.$id.context", () => {
  it("updates context projects while preserving the session execution project", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    saveSessionExecutionContext("session-1", {
      executionProjectId: "alpha",
      contextProjectIds: [],
    });

    const response = await action({
      params: { id: "session-1" },
      request: new Request("http://localhost/api/session/session-1/context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextProjectIds: ["beta", "alpha", "beta"],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(
      await readJson<{
        sessionId: string;
        executionContext: {
          executionProjectId: string;
          contextProjectIds: string[];
          updatedAt: string | null;
        };
      }>(response),
    ).toEqual({
      sessionId: "session-1",
      executionContext: {
        executionProjectId: "alpha",
        contextProjectIds: ["beta"],
        updatedAt: expect.any(String),
      },
    });
    expect(readSessionExecutionContext("session-1")).toEqual({
      executionProjectId: "alpha",
      contextProjectIds: ["beta"],
      updatedAt: expect.any(String),
    });
  });

  it("rejects execution project changes for existing sessions", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    saveSessionExecutionContext("session-2", {
      executionProjectId: "alpha",
      contextProjectIds: ["beta"],
    });

    const response = await action({
      params: { id: "session-2" },
      request: new Request("http://localhost/api/session/session-2/context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executionProjectId: "beta",
          contextProjectIds: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(409);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: "Execution project cannot be changed after session creation.",
    });
    expect(readSessionExecutionContext("session-2").executionProjectId).toBe("alpha");
  });

  it("rejects context changes for mission-managed sessions", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", {
      executionProjectId: "alpha",
      contextProjectIds: ["beta"],
    });
    setWorkerSession(missionId, "ignis", "session-ignis");

    const response = await action({
      params: { id: "session-ignis" },
      request: new Request("http://localhost/api/session/session-ignis/context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contextProjectIds: ["gamma"] }),
      }),
    } as never);

    expect(response.status).toBe(409);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: "Mission-managed sessions use mission-owned context.",
    });
  });
});