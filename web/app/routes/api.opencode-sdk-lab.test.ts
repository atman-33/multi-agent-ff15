import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { abortMock, messagesMock, promptAsyncMock, sessionCreateMock } = vi.hoisted(() => ({
  abortMock: vi.fn(),
  messagesMock: vi.fn(),
  promptAsyncMock: vi.fn(),
  sessionCreateMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      abort: abortMock,
      create: sessionCreateMock,
      messages: messagesMock,
      promptAsync: promptAsyncMock,
    },
  }),
}));

import { action } from "./api.opencode-sdk-lab";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-opencode-sdk-lab-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "logs"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

afterEach(() => {
  abortMock.mockReset();
  messagesMock.mockReset();
  promptAsyncMock.mockReset();
  sessionCreateMock.mockReset();

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

describe("api.opencode-sdk-lab", () => {
  it("creates a raw SDK session in the app root", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    sessionCreateMock.mockResolvedValue({ data: { id: "session-debug", title: "SDK Lab" } });

    const response = await action({
      request: new Request("http://localhost/api/opencode-sdk-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", title: "SDK Lab" }),
      }),
    } as never);

    expect(response.status).toBe(201);
    expect(sessionCreateMock).toHaveBeenCalledWith({
      directory: root,
      title: "SDK Lab",
    });
    await expect(response.json()).resolves.toEqual({
      action: "create",
      session: { id: "session-debug", title: "SDK Lab" },
    });
  });

  it("sends raw text prompts with optional agent and model selection", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-debug" } });

    const response = await action({
      request: new Request("http://localhost/api/opencode-sdk-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prompt",
          agent: "noctis",
          modelRef: "github-copilot/gpt-5-mini",
          sessionId: "session-debug",
          text: "continue",
          variant: "high",
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(promptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "noctis",
        model: {
          modelID: "gpt-5-mini",
          providerID: "github-copilot",
        },
        parts: [{ type: "text", text: "continue" }],
        sessionID: "session-debug",
        variant: "high",
      }),
    );
  });

  it("replays precomposed text parts without requiring a text field", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-debug" } });

    const response = await action({
      request: new Request("http://localhost/api/opencode-sdk-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prompt",
          parts: [{ type: "text", text: "<operation-prompt>continue</operation-prompt>" }],
          sessionId: "session-debug",
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(promptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [{ type: "text", text: "<operation-prompt>continue</operation-prompt>" }],
        sessionID: "session-debug",
      }),
    );
  });

  it("reloads messages and aborts without mission wrappers", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    messagesMock.mockResolvedValue({
      data: [{ info: { id: "msg-1", role: "assistant" }, parts: [{ type: "text", text: "hi" }] }],
    });
    abortMock.mockResolvedValue({ data: { ok: true } });

    const messagesResponse = await action({
      request: new Request("http://localhost/api/opencode-sdk-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "messages", sessionId: "session-debug" }),
      }),
    } as never);

    expect(messagesResponse.status).toBe(200);
    await expect(messagesResponse.json()).resolves.toEqual({
      action: "messages",
      messages: [{ info: { id: "msg-1", role: "assistant" }, parts: [{ type: "text", text: "hi" }] }],
      sessionId: "session-debug",
    });

    const abortResponse = await action({
      request: new Request("http://localhost/api/opencode-sdk-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "abort", sessionId: "session-debug" }),
      }),
    } as never);

    expect(abortResponse.status).toBe(200);
    await expect(abortResponse.json()).resolves.toEqual({
      action: "abort",
      result: { ok: true },
      sessionId: "session-debug",
    });
  });
});