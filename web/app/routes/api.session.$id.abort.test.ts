import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMission, deleteMission, getMission, setWorkerSession } from "@/lib/mission-store";

const {
  abortMock,
  appendSessionPromptDebugLogMock,
  resolveSessionRouteTargetMock,
  resolvedAbortMock,
  resolvedSessionListMock,
  sessionListMock,
} = vi.hoisted(() => ({
  abortMock: vi.fn(),
  appendSessionPromptDebugLogMock: vi.fn(),
  resolveSessionRouteTargetMock: vi.fn(),
  resolvedAbortMock: vi.fn(),
  resolvedSessionListMock: vi.fn(),
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

vi.mock("@/lib/session-owner-routing.server", () => ({
  resolveSessionRouteTarget: resolveSessionRouteTargetMock,
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
  beforeEach(() => {
    resolveSessionRouteTargetMock.mockImplementation(() => ({
      client: {
        session: {
          abort: abortMock,
          list: sessionListMock,
        },
      },
      endpointUrl: null,
      managedSession: null,
      mode: "default",
      ownerAgent: null,
    }));
  });

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
    resolveSessionRouteTargetMock.mockReturnValue({
      client: {
        session: {
          abort: abortMock,
          list: sessionListMock,
        },
      },
      endpointUrl: "http://127.0.0.1:4403",
      managedSession: {
        missionId,
        ownerAgent: "ignis",
        ownerLabel: "Ignis",
      },
      mode: "managed",
      ownerAgent: "ignis",
    });

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

  it("aborts managed sessions through the resolved owner-aware client", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", { executionProjectId: "alpha" });
    setWorkerSession(missionId, "ignis", "session-ignis");

    sessionListMock.mockRejectedValue(new Error("default client should not be used"));
    abortMock.mockRejectedValue(new Error("default client should not be used"));
    resolvedSessionListMock.mockResolvedValue({
      data: [{ id: "session-ignis", title: `mission:${missionId}:ignis` }],
    });
    resolvedAbortMock.mockResolvedValue({ data: { ok: true } });
    resolveSessionRouteTargetMock.mockReturnValue({
      client: {
        session: {
          abort: resolvedAbortMock,
          list: resolvedSessionListMock,
        },
      },
      endpointUrl: "http://127.0.0.1:4403",
      managedSession: {
        missionId,
        ownerAgent: "ignis",
        ownerLabel: "Ignis",
      },
      mode: "managed",
      ownerAgent: "ignis",
    });

    const response = await action({ params: { id: "session-ignis" } } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});