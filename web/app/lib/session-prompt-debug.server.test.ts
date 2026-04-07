import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getProjectRootMock } = vi.hoisted(() => ({
  getProjectRootMock: vi.fn(),
}));

vi.mock("@/lib/get-project-root.server", () => ({
  getProjectRoot: getProjectRootMock,
}));

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-session-prompt-debug-"));
  tempRoots.push(root);
  getProjectRootMock.mockReturnValue(root);
  return root;
}

async function loadModule() {
  vi.resetModules();
  return import("./session-prompt-debug.server");
}

afterEach(() => {
  getProjectRootMock.mockReset();

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("session-prompt-debug.server", () => {
  it("appends sanitized JSONL events under logs", async () => {
    const root = createTempRoot();
    const module = await loadModule();

    module.appendSessionPromptDebugLog({
      route: "api.session.$id.prompt",
      stage: "prompt-dispatched",
      requestId: "req-1",
      sessionId: "ses-1",
      payload: {
        agent: "Sisyphus (Ultraworker)",
        error: new Error("boom"),
        parts: [{ type: "text", text: "hello" }],
      },
    });

    const logPath = module.getSessionPromptDebugLogPath(root);
    expect(existsSync(logPath)).toBe(true);

    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);

    expect(JSON.parse(lines[0])).toMatchObject({
      route: "api.session.$id.prompt",
      stage: "prompt-dispatched",
      requestId: "req-1",
      sessionId: "ses-1",
      payload: {
        agent: "Sisyphus (Ultraworker)",
        error: {
          message: "boom",
          name: "Error",
        },
        parts: [{ type: "text", text: "hello" }],
      },
    });
  });
});