import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMission, deleteMission, getMission, setAgentModels, setWorkerSession } from "@/lib/mission-store";
import { listOwnedSessionTmuxDispatchItems } from "@/lib/owned-session-transport.server";
import { saveOwnedSession } from "@/lib/owned-session-registry.server";

const {
  appendSessionPromptDebugLogMock,
  ownerPromptAsyncMock,
  ownerSessionListMock,
  promptAsyncMock,
  sessionListMock,
} = vi.hoisted(() => ({
  appendSessionPromptDebugLogMock: vi.fn(),
  ownerPromptAsyncMock: vi.fn(),
  ownerSessionListMock: vi.fn(),
  promptAsyncMock: vi.fn(),
  sessionListMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  createProjectOpencodeClient: () => ({
    session: {
      list: ownerSessionListMock,
      promptAsync: ownerPromptAsyncMock,
    },
  }),
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

function writeEndpointManifest(
  root: string,
  agents: Array<{ agentId: string; port: number; url: string }>,
): void {
  mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(
    join(root, "runtime", "opencode-endpoints.json"),
    `${JSON.stringify(
      {
        version: 1,
        startedAt: "2026-04-30T00:00:00.000Z",
        agents,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

function writeReadyTmuxTransportArtifacts(
  root: string,
  agents: Array<{ agentId: string; port: number; url: string }>,
): void {
  writeEndpointManifest(root, agents);
  writeFileSync(
    join(root, "runtime", "tmux-transport-dispatcher.json"),
    `${JSON.stringify(
      {
        version: 1,
        owner: "standby",
        mode: "tmux-resident",
        pid: process.pid,
        startedAt: "2026-04-30T00:00:00.000Z",
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

afterEach(() => {
  appendSessionPromptDebugLogMock.mockReset();
  ownerPromptAsyncMock.mockReset();
  ownerSessionListMock.mockReset();
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
  it("queues owned Iris session prompts for tmux-resident delivery", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeReadyTmuxTransportArtifacts(root, [
      {
        agentId: "iris",
        port: 4405,
        url: "http://127.0.0.1:4405",
      },
    ]);
    saveOwnedSession({
      ownerAgent: "iris",
      sessionId: "session-iris",
      sessionTitle: "iris:projects",
      surface: "projects-iris",
      transportMode: "tmux-resident",
    });

    promptAsyncMock.mockResolvedValue({ error: "default client should not be used" });

    const response = await action({
      params: { id: "session-iris" },
      request: new Request("http://localhost/api/session/session-iris/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: [{ type: "text", text: "Refresh the project registry." }],
          agent: "iris",
        }),
      }),
    } as never);

    expect(response.status).toBe(204);
    expect(ownerPromptAsyncMock).not.toHaveBeenCalled();
    expect(promptAsyncMock).not.toHaveBeenCalled();
    expect(listOwnedSessionTmuxDispatchItems("session-iris")).toMatchObject([
      {
        status: "pending",
        payload: {
          agent: "iris",
          sessionId: "session-iris",
          sessionTitle: "iris:projects",
          parts: [{ type: "text", text: "Refresh the project registry." }],
        },
      },
    ]);
  });

  it("logs manual managed-session overrides and mirrors worker overrides into mission activity", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeEndpointManifest(root, [
      {
        agentId: "ignis",
        port: 4402,
        url: "http://127.0.0.1:4402",
      },
    ]);
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

    ownerSessionListMock.mockResolvedValue({
      data: [{ id: "session-ignis", title: `mission:${missionId}:ignis` }],
    });
    ownerPromptAsyncMock.mockResolvedValue({ data: { ok: true } });

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
    expect(ownerPromptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionID: "session-ignis",
        agent: "prompto",
        model: {
          providerID: "openai",
          modelID: "gpt-4.1",
        },
      }),
    );
    expect(promptAsyncMock).not.toHaveBeenCalled();
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