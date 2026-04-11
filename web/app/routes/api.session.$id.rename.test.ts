import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMission, deleteMission } from "@/lib/mission-store";

const { sessionUpdateMock } = vi.hoisted(() => ({
  sessionUpdateMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      update: sessionUpdateMock,
    },
  }),
}));

import { action } from "./api.session.$id.rename";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];
const missionIds: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-api-session-rename-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

afterEach(() => {
  sessionUpdateMock.mockReset();

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
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("api.session.$id.rename", () => {
  it("rejects rename requests for mission-managed sessions", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", { executionProjectId: "alpha" });

    const response = await action({
      params: { id: "session-noctis" },
      request: new Request("http://localhost/api/session/session-noctis/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Renamed" }),
      }),
    } as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Mission-managed sessions cannot be renamed.",
    });
    expect(sessionUpdateMock).not.toHaveBeenCalled();
  });
});