import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { sessionMessagesMock, sessionStatusMock } = vi.hoisted(() => ({
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

import {
  appendAmbientBanter,
  appendConversationLogEntry,
  createMission,
  deleteMission,
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

    const payload = await buildMissionSurfaceHydrationPayload(mission);

    expect(payload).not.toHaveProperty("primaryMessages");
    expect(payload).not.toHaveProperty("noctisMessages");
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
    expect(sessionMessagesMock).not.toHaveBeenCalled();
  });

  it("omits team-only runtime fields for Lunafreya", async () => {
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

    const payload = await buildMissionSurfaceHydrationPayload(mission);

    expect(payload).not.toHaveProperty("primaryMessages");
    expect(payload).not.toHaveProperty("noctisMessages");
    expect(payload).not.toHaveProperty("banterTimeline");
    expect(Object.keys(payload.contextUsageByAgent)).toEqual(["lunafreya"]);
    expect(payload.sessionStatuses).toEqual({
      "session-lunafreya": "busy",
    });
    expect(sessionMessagesMock).not.toHaveBeenCalled();
  });
});