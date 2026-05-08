import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMission, deleteMission, setWorkerSession } from "@/lib/mission-store";

const {
  promptAsyncMock,
  queueTmuxAgentDispatchMock,
  resolveManagedSessionActivationTitleMock,
  resolveOwnerEndpointTargetMock,
} = vi.hoisted(() => ({
  promptAsyncMock: vi.fn(),
  queueTmuxAgentDispatchMock: vi.fn(),
  resolveManagedSessionActivationTitleMock: vi.fn(),
  resolveOwnerEndpointTargetMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      promptAsync: promptAsyncMock,
    },
  }),
}));

vi.mock("@/lib/session-owner-routing.server", () => ({
  resolveOwnerEndpointTarget: resolveOwnerEndpointTargetMock,
}));

vi.mock("@/lib/managed-session-activation.server", () => ({
  resolveManagedSessionActivationTitle: resolveManagedSessionActivationTitleMock,
}));

vi.mock("@/lib/primary-agent-outbox-dispatch.server", () => ({
  queueTmuxAgentDispatch: queueTmuxAgentDispatchMock,
}));

import { action } from "./route";

const missionIds: string[] = [];

afterEach(() => {
  while (missionIds.length > 0) {
    const missionId = missionIds.pop();
    if (missionId) {
      deleteMission(missionId);
    }
  }
});

describe("api.missions.$missionId.agents.$agentId.continue", () => {
  beforeEach(() => {
    promptAsyncMock.mockReset();
    queueTmuxAgentDispatchMock.mockReset();
    resolveManagedSessionActivationTitleMock.mockReset();
    resolveOwnerEndpointTargetMock.mockReset();
  });

  it("sends a raw continue prompt to an existing direct worker mission session", async () => {
    const missionId = `mission-continue-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    const mission = createMission(missionId, `session-${missionId}`, {
      title: "Continue Worker Session",
      objective: "Nudge a stopped worker session",
      allowedWorkers: ["ignis", "gladiolus", "prompto"],
    });
    mission.transportMode = "app-owned";
    setWorkerSession(missionId, "ignis", "session-ignis");
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-continue" } });

    const response = await action({
      request: new Request(
        `http://localhost/api/missions/${missionId}/agents/ignis/continue`,
        {
          method: "POST",
        }
      ),
      params: {
        missionId,
        agentId: "ignis",
      },
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      missionId,
      agentId: "ignis",
      sessionId: "session-ignis",
    });
    expect(promptAsyncMock).toHaveBeenCalledWith({
      sessionID: "session-ignis",
      parts: [{ type: "text", text: "continue" }],
      agent: "ignis",
    });
    expect(resolveOwnerEndpointTargetMock).not.toHaveBeenCalled();
  });

  it("queues a raw continue prompt for an existing tmux-resident worker mission session", async () => {
    const missionId = `mission-continue-tmux-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    const mission = createMission(missionId, `session-${missionId}`, {
      title: "Continue Worker Session In Tmux",
      objective: "Queue a stopped worker session nudge",
      allowedWorkers: ["ignis", "gladiolus", "prompto"],
    });
    mission.transportMode = "tmux-resident";
    setWorkerSession(missionId, "ignis", "session-ignis-tmux");
    resolveManagedSessionActivationTitleMock.mockResolvedValue(`mission:${missionId}:ignis`);
    resolveOwnerEndpointTargetMock.mockReturnValue({
      client: {
        session: {
          list: vi.fn(),
        },
      },
      endpointUrl: "http://127.0.0.1:4401",
      managedSession: null,
      mode: "managed",
      ownedSession: null,
      ownerAgent: "ignis",
    });

    const response = await action({
      request: new Request(
        `http://localhost/api/missions/${missionId}/agents/ignis/continue`,
        {
          method: "POST",
        }
      ),
      params: {
        missionId,
        agentId: "ignis",
      },
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      missionId,
      agentId: "ignis",
      sessionId: "session-ignis-tmux",
    });
    expect(queueTmuxAgentDispatchMock).toHaveBeenCalledWith({
      activityBody: "Queued raw continue delivery.",
      agent: "ignis",
      missionId,
      parts: [{ type: "text", text: "continue" }],
      sessionId: "session-ignis-tmux",
      sessionTitle: `mission:${missionId}:ignis`,
    });
    expect(promptAsyncMock).not.toHaveBeenCalled();
  });

  it("rejects raw continue when the mission has no session for the requested agent", async () => {
    const missionId = `mission-continue-missing-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    const mission = createMission(missionId, `session-${missionId}`, {
      title: "Missing Continue Session",
      objective: "Reject a missing session continue request",
      allowedWorkers: ["ignis", "gladiolus", "prompto"],
    });
    mission.transportMode = "app-owned";

    const response = await action({
      request: new Request(
        `http://localhost/api/missions/${missionId}/agents/ignis/continue`,
        {
          method: "POST",
        }
      ),
      params: {
        missionId,
        agentId: "ignis",
      },
    } as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Mission session not found" });
    expect(promptAsyncMock).not.toHaveBeenCalled();
    expect(queueTmuxAgentDispatchMock).not.toHaveBeenCalled();
  });
});