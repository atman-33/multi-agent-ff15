import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listSessionStatusTargetsMock,
  resolveSessionRouteTargetMock,
  sessionMessagesMock,
  sessionStatusMock,
} = vi.hoisted(() => ({
  listSessionStatusTargetsMock: vi.fn(),
  resolveSessionRouteTargetMock: vi.fn(),
  sessionMessagesMock: vi.fn(),
  sessionStatusMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      messages: sessionMessagesMock,
      status: sessionStatusMock,
    },
  }),
}));

vi.mock("./session-owner-routing.server", () => ({
  listSessionStatusTargets: listSessionStatusTargetsMock,
  resolveSessionRouteTarget: resolveSessionRouteTargetMock,
}));

import {
  appendAmbientBanter,
  appendConversationLogEntry,
  createMission,
  deleteMission,
  getMission,
  setWorkerSession,
} from "@/lib/mission-store";
import { buildMissionSurfaceHydrationPayload } from "./mission-surface-hydration.server";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-mission-surface-runtime-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "runtime", "session-context"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

function writeContextSnapshot(root: string, sessionId: string): void {
  writeFileSync(
    join(root, "runtime", "session-context", `${sessionId}.json`),
    `${JSON.stringify(
      {
        calculatedAt: "2026-04-18T10:00:00.000Z",
        limitTokens: 128000,
        modelID: "gpt-5.4",
        providerID: "github-copilot",
        remainingPercentage: 0.5,
        remainingTokens: 64000,
        tokenBreakdown: {
          cacheRead: 0,
          cacheWrite: 0,
          input: 32000,
          output: 1000,
          reasoning: 500,
          total: 33500,
        },
        usedPercentage: 0.5,
        usedTokens: 64000,
        windowTokens: 128000,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

afterEach(() => {
  listSessionStatusTargetsMock.mockReset();
  resolveSessionRouteTargetMock.mockReset();
  sessionMessagesMock.mockReset();
  sessionStatusMock.mockReset();

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

beforeEach(() => {
  listSessionStatusTargetsMock.mockReturnValue([]);
  resolveSessionRouteTargetMock.mockImplementation((sessionId: string) => ({
    client: {
      session: {
        messages: sessionMessagesMock,
      },
    },
    endpointUrl: null,
    managedSession: null,
    mode: "default",
    ownerAgent: null,
    sessionId,
  }));
});

describe("mission-surface-hydration.server", () => {
  it("builds a shell-focused Noctis payload without duplicate history arrays", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const missionId = `mission-noctis-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    const mission = createMission(missionId, "session-noctis", {
      title: "Noctis shell mission",
      objective: "Verify shell-focused hydration",
    });
    setWorkerSession(missionId, "ignis", "session-ignis");
    setWorkerSession(missionId, "prompto", "session-prompto");
    writeContextSnapshot(root, "session-noctis");
    writeContextSnapshot(root, "session-ignis");
    writeContextSnapshot(root, "session-prompto");
    appendConversationLogEntry(missionId, {
      id: "directed-1",
      missionId,
      kind: "directed",
      fromAgent: "ignis",
      toAgent: "prompto",
      speakerAgent: "ignis",
      orchestratedBy: "noctis",
      cue: "task-delegated",
      renderedMessage: "Handle the follow-up.",
      createdAt: "2026-04-18T10:00:01.000Z",
      payload: {},
      transport: { deliveryStatus: "sent", deliveredToSessionId: "session-prompto" },
    });
    appendAmbientBanter(missionId, {
      id: "ambient-1",
      missionId,
      kind: "ambient",
      speakerAgent: "ignis",
      cue: "task-progress-early",
      renderedMessage: "Reviewing the changes.",
      createdAt: "2026-04-18T10:00:02.000Z",
      payload: { sourceEvent: "task.progress" },
    });

    sessionStatusMock.mockResolvedValue({
      data: {
        "session-noctis": "busy",
        "session-ignis": "retry",
        "session-prompto": "idle",
      },
    });
    sessionMessagesMock.mockResolvedValue({
      data: [
        {
          info: {
            id: "message-1",
            role: "assistant",
            time: { created: Date.parse("2026-04-29T00:00:00.000Z") },
          },
          parts: [{ type: "text", text: "Primary reply" }],
        },
      ],
    });

    const payload = await buildMissionSurfaceHydrationPayload(mission);

    expect(payload).not.toHaveProperty("primaryMessages");
    expect(payload).not.toHaveProperty("noctisMessages");
    expect(payload.latestPrimaryMessageId).toBe("message-1");
    expect(payload.latestPrimaryMessageCreatedAt).toBe("2026-04-29T00:00:00.000Z");
    expect(payload.banterTimeline).toHaveLength(2);
    expect(Object.keys(payload.contextUsageByAgent).sort()).toEqual([
      "ignis",
      "noctis",
      "prompto",
    ]);
    expect(payload.contextUsageByAgent).not.toHaveProperty("lunafreya");
    expect(payload.sessionStatuses).toEqual({
      "session-noctis": "busy",
      "session-ignis": "retry",
      "session-prompto": "idle",
    });
    expect(getMission(missionId)).toMatchObject({
      latestPrimaryMessageId: "message-1",
      latestPrimaryMessageCreatedAt: "2026-04-29T00:00:00.000Z",
    });
    expect(sessionMessagesMock).toHaveBeenCalledWith({ sessionID: "session-noctis" });
  });

  it("keeps banter hydration while omitting team-only runtime fields for Lunafreya", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const missionId = `mission-lunafreya-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    const mission = createMission(missionId, "session-lunafreya", {
      title: "Lunafreya shell mission",
      objective: "Verify surface-aware filtering",
      primaryAgentId: "lunafreya",
      surfaceId: "lunafreya",
    });
    setWorkerSession(missionId, "ignis", "session-ignis");
    writeContextSnapshot(root, "session-lunafreya");
    writeContextSnapshot(root, "session-ignis");
    appendAmbientBanter(missionId, {
      id: "ambient-luna-1",
      missionId,
      kind: "ambient",
      speakerAgent: "ignis",
      cue: "task-progress-early",
      renderedMessage: "Should not leak into Lunafreya shell.",
      createdAt: "2026-04-18T10:00:03.000Z",
      payload: { sourceEvent: "task.progress" },
    });

    sessionStatusMock.mockResolvedValue({
      data: {
        "session-lunafreya": "busy",
        "session-ignis": "busy",
      },
    });
    sessionMessagesMock.mockResolvedValue({ data: [] });

    const payload = await buildMissionSurfaceHydrationPayload(mission);

    expect(payload).not.toHaveProperty("primaryMessages");
    expect(payload).not.toHaveProperty("noctisMessages");
    expect(payload.banterTimeline).toEqual([
      expect.objectContaining({
        id: "ambient-luna-1",
        cue: "task-progress-early",
        renderedMessage: "Should not leak into Lunafreya shell.",
        speakerAgent: "ignis",
      }),
    ]);
    expect(payload.latestPrimaryMessageId).toBeNull();
    expect(payload.latestPrimaryMessageCreatedAt).toBeNull();
    expect(Object.keys(payload.contextUsageByAgent)).toEqual(["lunafreya"]);
    expect(payload.sessionStatuses).toEqual({
      "session-lunafreya": "busy",
    });
    expect(sessionMessagesMock).toHaveBeenCalledWith({ sessionID: "session-lunafreya" });
  });

  it("routes managed primary session hydration through the owning agent endpoint", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const missionId = `mission-managed-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    const mission = createMission(missionId, "session-noctis", {
      title: "Managed Noctis mission",
      objective: "Verify owner-aware hydration",
    });
    writeContextSnapshot(root, "session-noctis");

    const managedMessagesMock = vi.fn().mockResolvedValue({
      data: [
        {
          info: {
            id: "message-managed-1",
            role: "assistant",
            time: { created: Date.parse("2026-04-29T00:00:00.000Z") },
          },
          parts: [{ type: "text", text: "Managed primary reply" }],
        },
      ],
    });
    const managedStatusMock = vi.fn().mockResolvedValue({
      data: {
        "session-noctis": "busy",
      },
    });

    sessionStatusMock.mockResolvedValue({
      data: {
        "session-noctis": "idle",
      },
    });
    sessionMessagesMock.mockResolvedValue({ data: [] });
    listSessionStatusTargetsMock.mockReturnValue([
      {
        agentId: "noctis",
        client: {
          session: {
            status: managedStatusMock,
          },
        },
        endpointUrl: "http://127.0.0.1:4401",
      },
    ]);
    resolveSessionRouteTargetMock.mockReturnValue({
      client: {
        session: {
          messages: managedMessagesMock,
        },
      },
      endpointUrl: "http://127.0.0.1:4401",
      managedSession: {
        missionId,
        ownerAgent: "noctis",
      },
      mode: "managed",
      ownerAgent: "noctis",
    });

    const payload = await buildMissionSurfaceHydrationPayload(mission);

    expect(resolveSessionRouteTargetMock).toHaveBeenCalledWith("session-noctis");
    expect(managedMessagesMock).toHaveBeenCalledWith({ sessionID: "session-noctis" });
    expect(sessionMessagesMock).not.toHaveBeenCalled();
    expect(payload.latestPrimaryMessageId).toBe("message-managed-1");
    expect(payload.sessionStatuses).toEqual({
      "session-noctis": "busy",
    });
  });
});