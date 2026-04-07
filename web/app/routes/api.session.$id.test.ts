import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { sessionMessagesMock } = vi.hoisted(() => ({
  sessionMessagesMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      messages: sessionMessagesMock,
    },
  }),
}));

import { saveSessionRequestAnchor } from "@/lib/session-request-anchors.server";
import { loader } from "./api.session.$id";

const tempRoots: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-api-session-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

afterEach(() => {
  sessionMessagesMock.mockReset();

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

describe("api.session.$id", () => {
  it("adds selection adjustment metadata when a tracked assistant reply differs from the requested selection", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    saveSessionRequestAnchor({
      sessionId: "session-1",
      userMessageId: "user-1",
      requested: {
        agent: "Sisyphus (Ultraworker)",
        model: {
          providerID: "github-copilot",
          modelID: "gpt-5-mini",
          variant: "high",
        },
      },
    });

    sessionMessagesMock.mockResolvedValue({
      data: [
        {
          info: {
            id: "user-1",
            role: "user",
            agent: "Sisyphus (Ultraworker)",
            model: { providerID: "github-copilot", modelID: "gpt-5-mini" },
            variant: "high",
            time: { created: Date.parse("2026-04-07T10:00:00.000Z") },
          },
          parts: [{ type: "text", text: "Please continue." }],
        },
        {
          info: {
            id: "assistant-1",
            role: "assistant",
            parentID: "user-1",
            agent: "Hephaestus (Deep Agent)",
            providerID: "github-copilot",
            modelID: "gpt-5.4",
            time: { created: Date.parse("2026-04-07T10:00:05.000Z") },
          },
          parts: [{ type: "text", text: "Reply from the adjusted agent." }],
        },
      ],
    });

    const response = await loader({ params: { id: "session-1" } } as never);
    expect(response.status).toBe(200);

    const data = await readJson<{ messages: Array<{ info: Record<string, unknown> }> }>(response);
    expect(data.messages[1]?.info.selectionAdjustment).toMatchObject({
      explanation: "Runtime adjusted the requested selection before recording this reply.",
      requested: {
        agent: "Sisyphus (Ultraworker)",
        model: {
          providerID: "github-copilot",
          modelID: "gpt-5-mini",
          variant: "high",
        },
      },
      actual: {
        agent: "Hephaestus (Deep Agent)",
        model: {
          providerID: "github-copilot",
          modelID: "gpt-5.4",
        },
      },
    });
  });

  it("does not backfill adjustment metadata for untracked or matching replies", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    saveSessionRequestAnchor({
      sessionId: "session-2",
      userMessageId: "user-2",
      requested: {
        agent: "Sisyphus (Ultraworker)",
        model: {
          providerID: "github-copilot",
          modelID: "gpt-5.4",
        },
      },
    });

    sessionMessagesMock.mockResolvedValue({
      data: [
        {
          info: {
            id: "assistant-match",
            role: "assistant",
            parentID: "user-2",
            agent: "Sisyphus (Ultraworker)",
            providerID: "github-copilot",
            modelID: "gpt-5.4",
            time: { created: Date.parse("2026-04-07T10:10:00.000Z") },
          },
          parts: [{ type: "text", text: "No change." }],
        },
        {
          info: {
            id: "assistant-untracked",
            role: "assistant",
            parentID: "user-missing",
            agent: "Hephaestus (Deep Agent)",
            providerID: "github-copilot",
            modelID: "gpt-5.4",
            time: { created: Date.parse("2026-04-07T10:11:00.000Z") },
          },
          parts: [{ type: "text", text: "No tracking available." }],
        },
      ],
    });

    const response = await loader({ params: { id: "session-2" } } as never);
    expect(response.status).toBe(200);

    const data = await readJson<{ messages: Array<{ info: Record<string, unknown> }> }>(response);
    expect(data.messages[0]?.info.selectionAdjustment).toBeUndefined();
    expect(data.messages[1]?.info.selectionAdjustment).toBeUndefined();
  });
});