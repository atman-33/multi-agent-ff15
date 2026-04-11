import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMission, deleteMission, getMission, setWorkerSession } from "@/lib/mission-store";

const {
  abortMock,
  appendSessionPromptDebugLogMock,
  sessionListMock,
} = vi.hoisted(() => ({
  abortMock: vi.fn(),
  appendSessionPromptDebugLogMock: vi.fn(),
  sessionListMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      abort: abortMock,
      list: sessionListMock,
    },
  }),
}));

vi.mock("@/lib/session-prompt-debug.server", () => ({
  appendSessionPromptDebugLog: appendSessionPromptDebugLogMock,
}));

import { action } from "./api.session.$id.abort";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];
const missionIds: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-api-session-abort-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

afterEach(() => {
  abortMock.mockReset();
  appendSessionPromptDebugLogMock.mockReset();
  sessionListMock.mockReset();

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

describe("api.session.$id.abort", () => {
  it("records managed abort activity and debug logs", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", { executionProjectId: "alpha" });
    setWorkerSession(missionId, "ignis", "session-ignis");

    sessionListMock.mockResolvedValue({
      data: [{ id: "session-ignis", title: `mission:${missionId}:ignis` }],
    });
    abortMock.mockResolvedValue({ data: { ok: true } });

    const response = await action({ params: { id: "session-ignis" } } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(getMission(missionId)?.activityLog.at(-1)).toMatchObject({
      actor: "system",
      speaker: "system",
      kind: "system_event",
      body: "OpenCode manually aborted the managed Ignis session.",
      source: {
        sessionId: "session-ignis",
        type: "system",
      },
    });
    expect(appendSessionPromptDebugLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "api.session.$id.abort",
        stage: "abort-result",
        payload: expect.objectContaining({
          managedSession: expect.objectContaining({
            missionId,
            ownerAgent: "ignis",
            rawSessionTitle: `mission:${missionId}:ignis`,
          }),
        }),
      }),
    );
  });
});