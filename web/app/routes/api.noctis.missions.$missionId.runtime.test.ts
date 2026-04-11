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
import { loader } from "./api.noctis.missions.$missionId.runtime";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-runtime-route-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "runtime", "session-context"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
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

describe("api.noctis.missions.$missionId.runtime", () => {
  it("returns a merged banter timeline for directed and ambient entries", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const missionId = `mission-banter-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", {
      title: "Banter mission",
      objective: "Verify banter timeline",
    });

    appendConversationLogEntry(missionId, {
      id: "conversation-1",
      missionId,
      kind: "directed",
      fromAgent: "ignis",
      toAgent: "gladiolus",
      speakerAgent: "ignis",
      orchestratedBy: "noctis",
      cue: "task-delegated",
      renderedMessage: "こっちを頼む。",
      createdAt: "2026-04-11T00:00:00.000Z",
      payload: {
        taskId: "task-review",
        stepName: "review",
        canonicalMessage: "Please take the review step.",
      },
      transport: {
        deliveryStatus: "sent",
        deliveredToSessionId: "session-gladiolus",
      },
    });

    appendAmbientBanter(missionId, {
      id: "ambient-1",
      missionId,
      kind: "ambient",
      speakerAgent: "ignis",
      cue: "task-progress-early",
      renderedMessage: "関連箇所を洗っている。",
      createdAt: "2026-04-11T00:00:01.000Z",
      payload: {
        sourceEvent: "task.progress",
      },
    });

    sessionStatusMock.mockResolvedValue({ data: { "session-noctis": "idle" } });
    sessionMessagesMock.mockResolvedValue({ data: [] });

    const response = await loader({ params: { missionId } } as never);
    expect(response.status).toBe(200);

    const data = await readJson<{
      banterTimeline: Array<{
        id: string;
        kind: "directed" | "ambient";
        renderedMessage: string;
      }>;
    }>(response);

    expect(data.banterTimeline).toEqual([
      expect.objectContaining({
        id: "conversation-1",
        kind: "directed",
        renderedMessage: "こっちを頼む。",
      }),
      expect.objectContaining({
        id: "ambient-1",
        kind: "ambient",
        renderedMessage: "関連箇所を洗っている。",
      }),
    ]);
  });

  it("returns persisted chronology even when an older ambient entry was appended later", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const missionId = `mission-banter-refresh-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", {
      title: "Banter refresh order",
      objective: "Verify persisted chronology on reload",
    });

    appendConversationLogEntry(missionId, {
      id: "report-1",
      missionId,
      kind: "directed",
      fromAgent: "prompto",
      toAgent: "noctis",
      speakerAgent: "prompto",
      orchestratedBy: "noctis",
      cue: "report-completed",
      renderedMessage: "Report delivered.",
      createdAt: "2026-04-11T10:00:02.000Z",
    });

    appendAmbientBanter(missionId, {
      id: "settled-older",
      missionId,
      kind: "ambient",
      speakerAgent: "noctis",
      cue: "session-settled",
      renderedMessage: "Settled.",
      createdAt: "2026-04-11T09:59:59.000Z",
      payload: {
        sourceEvent: "session.settled",
      },
    });

    sessionStatusMock.mockResolvedValue({ data: { "session-noctis": "idle" } });
    sessionMessagesMock.mockResolvedValue({ data: [] });

    const response = await loader({ params: { missionId } } as never);
    expect(response.status).toBe(200);

    const data = await readJson<{
      banterTimeline: Array<{
        id: string;
      }>;
    }>(response);

    expect(data.banterTimeline.map((entry) => entry.id)).toEqual(["settled-older", "report-1"]);
  });

  it("returns normalized context usage for new and legacy snapshots", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const missionId = `mission-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", {
      title: "Runtime mission",
      objective: "Verify context usage",
    });
    setWorkerSession(missionId, "ignis", "session-ignis");

    writeFileSync(
      join(root, "runtime", "session-context", "session-noctis.json"),
      `${JSON.stringify(
        {
          calculatedAt: "2026-04-11T00:00:00.000Z",
          limitTokens: 128000,
          modelID: "claude-haiku-4.5",
          providerID: "github-copilot",
          remainingPercentage: 0.75,
          remainingTokens: 96000,
          tokenBreakdown: {
            cacheRead: 8000,
            cacheWrite: 0,
            input: 24000,
            output: 1000,
            reasoning: 0,
            total: 33000,
          },
          usedPercentage: 0.25,
          usedTokens: 32000,
          windowTokens: 144000,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    writeFileSync(
      join(root, "runtime", "session-context", "session-ignis.json"),
      `${JSON.stringify(
        {
          calculatedAt: "2026-04-11T00:05:00.000Z",
          limitTokens: 200000,
          modelID: "gpt-5.4",
          providerID: "github-copilot",
          remainingPercentage: 0.5,
          remainingTokens: 100000,
          tokenBreakdown: {
            cacheRead: 5000,
            cacheWrite: 0,
            input: 95000,
            output: 1200,
            reasoning: 0,
            total: 101200,
          },
          usedPercentage: 0.5,
          usedTokens: 100000,
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    sessionStatusMock.mockResolvedValue({ data: { "session-noctis": "idle", "session-ignis": "busy" } });
    sessionMessagesMock.mockResolvedValue({ data: [] });

    const response = await loader({ params: { missionId } } as never);
    expect(response.status).toBe(200);

    const data = await readJson<{
      contextUsageByAgent: {
        noctis: { limitTokens: number; windowTokens: number } | null;
        ignis: { limitTokens: number; windowTokens: number } | null;
      };
    }>(response);

    expect(data.contextUsageByAgent.noctis).toMatchObject({
      limitTokens: 128000,
      windowTokens: 144000,
    });
    expect(data.contextUsageByAgent.ignis).toMatchObject({
      limitTokens: 200000,
      windowTokens: 200000,
    });
  });
});