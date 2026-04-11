import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMission, deleteMission, getMission, setAgentModels, setWorkerSession } from "@/lib/mission-store";

const {
  appendSessionPromptDebugLogMock,
  promptAsyncMock,
  sessionListMock,
} = vi.hoisted(() => ({
  appendSessionPromptDebugLogMock: vi.fn(),
  promptAsyncMock: vi.fn(),
  sessionListMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      list: sessionListMock,
      promptAsync: promptAsyncMock,
    },
  }),
}));

vi.mock("@/lib/prompt-composition-engine", () => ({
  composeGenericSessionPrompt: ({ parts }: { parts: Array<{ type: string; text?: string }> }) => ({
    payloadParts: parts,
  }),
}));

vi.mock("@/lib/session-prompt-debug.server", () => ({
  appendSessionPromptDebugLog: appendSessionPromptDebugLogMock,
}));

import { action } from "./api.session.$id.prompt";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];
const missionIds: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-api-session-prompt-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

afterEach(() => {
  appendSessionPromptDebugLogMock.mockReset();
  promptAsyncMock.mockReset();
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

describe("api.session.$id.prompt", () => {
  it("logs manual managed-session overrides and mirrors worker overrides into mission activity", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const missionId = `mission-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", {
      executionProjectId: "alpha",
      contextProjectIds: ["beta"],
    });
    setWorkerSession(missionId, "ignis", "session-ignis");
    setAgentModels(missionId, {
      ignis: { providerID: "anthropic", modelID: "claude-3-7-sonnet" },
    });

    sessionListMock.mockResolvedValue({
      data: [{ id: "session-ignis", title: `mission:${missionId}:ignis` }],
    });
    promptAsyncMock.mockResolvedValue({ data: { ok: true } });

    const response = await action({
      params: { id: "session-ignis" },
      request: new Request("http://localhost/api/session/session-ignis/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: [{ type: "text", text: "Investigate the failing trace" }],
          agent: "prompto",
          model: { providerID: "openai", modelID: "gpt-4.1" },
        }),
      }),
    } as never);

    expect(response.status).toBe(204);
    expect(promptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionID: "session-ignis",
        agent: "prompto",
        model: {
          providerID: "openai",
          modelID: "gpt-4.1",
        },
      }),
    );
    expect(getMission(missionId)?.activityLog.at(-1)).toMatchObject({
      actor: "user",
      speaker: "user",
      kind: "user_message",
      body: "Investigate the failing trace",
      source: {
        sessionId: "session-ignis",
        type: "session_message",
      },
    });
    expect(appendSessionPromptDebugLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "api.session.$id.prompt",
        stage: "prompt-dispatched",
        payload: expect.objectContaining({
          managedSession: expect.objectContaining({
            assignedAgent: "ignis",
            missionId,
            ownerAgent: "ignis",
            rawSessionTitle: `mission:${missionId}:ignis`,
            selectedAgent: "prompto",
            selectedModel: {
              providerID: "openai",
              modelID: "gpt-4.1",
            },
          }),
        }),
      }),
    );
  });
});