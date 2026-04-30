import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMission, deleteMission, getMission, setWorkerSession } from "@/lib/mission-store";
import {
  enqueueTmuxDispatchItem,
  leaseTmuxDispatchItem,
  listTmuxDispatchItems,
} from "@/lib/mission-primary-agent-outbox.server";
import {
  getOwnedSessionTransportMissionId,
  listOwnedSessionTmuxDispatchItems,
  queueOwnedSessionTmuxDispatch,
} from "@/lib/owned-session-transport.server";

const {
  abortMock,
  appendSessionPromptDebugLogMock,
  interruptManagedTmuxSessionMock,
  requestTmuxDispatchAbortForSessionMock,
  resolveSessionRouteTargetMock,
  resolvedAbortMock,
  resolvedSessionListMock,
  sessionListMock,
} = vi.hoisted(() => ({
  abortMock: vi.fn(),
  appendSessionPromptDebugLogMock: vi.fn(),
  interruptManagedTmuxSessionMock: vi.fn(),
  requestTmuxDispatchAbortForSessionMock: vi.fn(),
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

vi.mock("@/lib/tmux-transport-abort.server", () => ({
  interruptManagedTmuxSession: interruptManagedTmuxSessionMock,
  requestTmuxDispatchAbortForSession: requestTmuxDispatchAbortForSessionMock,
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
  interruptManagedTmuxSessionMock.mockReset();
  requestTmuxDispatchAbortForSessionMock.mockReset();
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
    requestTmuxDispatchAbortForSessionMock.mockReturnValue({
      currentDispatch: null,
      requested: false,
    });
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
      ownedSession: null,
      ownerAgent: null,
    }));
  });

  it("cancels queued tmux work for owned Iris sessions before forwarding abort", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();

    queueOwnedSessionTmuxDispatch({
      ownerAgent: "iris",
      sessionId: "session-iris",
      sessionTitle: "iris:projects",
      parts: [{ type: "text", text: "pending Iris payload" }],
      queuedAt: "2026-04-28T01:00:00.000Z",
    });
    queueOwnedSessionTmuxDispatch({
      ownerAgent: "iris",
      sessionId: "session-iris",
      sessionTitle: "iris:projects",
      parts: [{ type: "text", text: "leased Iris payload" }],
      queuedAt: "2026-04-28T01:01:00.000Z",
    });
    leaseTmuxDispatchItem({
      missionId: getOwnedSessionTransportMissionId("session-iris"),
      leaseOwner: "dispatcher-abort",
      leasedAt: "2026-04-28T01:01:30.000Z",
      staleAfterMs: 30_000,
    });

    resolvedAbortMock.mockResolvedValue({ data: { ok: true } });
    requestTmuxDispatchAbortForSessionMock.mockReturnValue({
      currentDispatch: {
        agent: "iris",
        itemId: "item-dispatch-owned",
        missionId: getOwnedSessionTransportMissionId("session-iris"),
        phase: "typing-payload",
        sessionId: "session-iris",
        target: "ff15:main.5",
        updatedAt: "2026-04-30T10:00:00.000Z",
      },
      requested: true,
    });
    resolveSessionRouteTargetMock.mockReturnValue({
      client: {
        session: {
          abort: resolvedAbortMock,
          list: resolvedSessionListMock,
        },
      },
      endpointUrl: "http://127.0.0.1:4405",
      managedSession: null,
      mode: "owned",
      ownedSession: {
        ownerAgent: "iris",
        sessionTitle: "iris:projects",
        surface: "projects-iris",
        transportMode: "tmux-resident",
        updatedAt: "2026-04-30T00:00:00.000Z",
      },
      ownerAgent: "iris",
    });

    const response = await action({ params: { id: "session-iris" } } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(requestTmuxDispatchAbortForSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: getOwnedSessionTransportMissionId("session-iris"),
        requestedBy: "abort-route",
        sessionId: "session-iris",
      }),
    );
    expect(interruptManagedTmuxSessionMock).not.toHaveBeenCalled();
    expect(listOwnedSessionTmuxDispatchItems("session-iris")).toEqual([
      expect.objectContaining({
        status: "cancelled",
        cancellation: expect.objectContaining({
          cancelledBy: "abort-route",
          reason: "Owned session abort requested",
        }),
      }),
      expect.objectContaining({
        status: "cancelled",
        cancellation: expect.objectContaining({
          cancelledBy: "abort-route",
          reason: "Owned session abort requested",
        }),
      }),
    ]);
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

  it("cancels queued tmux work for the managed session before forwarding abort", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", { executionProjectId: "alpha" });
    setWorkerSession(missionId, "ignis", "session-ignis");

    enqueueTmuxDispatchItem({
      missionId,
      itemId: "item-abort-pending",
      createdAt: "2026-04-28T01:00:00.000Z",
      payload: {
        agent: "ignis",
        sessionId: "session-ignis",
        parts: [{ type: "text", text: "pending worker payload" }],
      },
    });
    enqueueTmuxDispatchItem({
      missionId,
      itemId: "item-abort-leased",
      createdAt: "2026-04-28T01:01:00.000Z",
      payload: {
        agent: "ignis",
        sessionId: "session-ignis",
        parts: [{ type: "text", text: "leased worker payload" }],
      },
    });
    leaseTmuxDispatchItem({
      missionId,
      leaseOwner: "dispatcher-abort",
      leasedAt: "2026-04-28T01:01:30.000Z",
      staleAfterMs: 30_000,
    });

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
    expect(listTmuxDispatchItems(missionId)).toEqual([
      expect.objectContaining({
        id: "item-abort-pending",
        status: "cancelled",
        cancellation: expect.objectContaining({
          cancelledBy: "abort-route",
          reason: "Managed session abort requested",
        }),
      }),
      expect.objectContaining({
        id: "item-abort-leased",
        status: "cancelled",
        cancellation: expect.objectContaining({
          cancelledBy: "abort-route",
          reason: "Managed session abort requested",
        }),
      }),
    ]);
  });

  it("requests dispatcher-side cancellation for pre-submit tmux dispatches", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", { executionProjectId: "alpha" });
    const mission = getMission(missionId);
    expect(mission).toBeTruthy();
    if (!mission) {
      throw new Error("Mission not found");
    }
    mission.transportMode = "tmux-resident";
    setWorkerSession(missionId, "ignis", "session-ignis");

    resolvedSessionListMock.mockResolvedValue({
      data: [{ id: "session-ignis", title: `mission:${missionId}:ignis` }],
    });
    resolvedAbortMock.mockResolvedValue({ data: { ok: true } });
    requestTmuxDispatchAbortForSessionMock.mockReturnValue({
      currentDispatch: {
        agent: "ignis",
        itemId: "item-dispatch-1",
        missionId,
        phase: "switch-model",
        sessionId: "session-ignis",
        target: "ff15:main.1",
        updatedAt: "2026-04-30T10:00:00.000Z",
      },
      requested: true,
    });
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
    expect(requestTmuxDispatchAbortForSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId,
        requestedBy: "abort-route",
        sessionId: "session-ignis",
      }),
    );
    expect(interruptManagedTmuxSessionMock).not.toHaveBeenCalled();
  });

  it("sends Escape for active tmux-managed responses when no pre-submit dispatch is in flight", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", { executionProjectId: "alpha" });
    const mission = getMission(missionId);
    expect(mission).toBeTruthy();
    if (!mission) {
      throw new Error("Mission not found");
    }
    mission.transportMode = "tmux-resident";
    setWorkerSession(missionId, "ignis", "session-ignis");

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
    expect(interruptManagedTmuxSessionMock).toHaveBeenCalledWith({
      method: "escape",
      ownerAgent: "ignis",
    });
  });
});