import { existsSync, mkdtempSync, rmSync } from "node:fs";
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
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-session-request-anchors-"));
  tempRoots.push(root);
  getProjectRootMock.mockReturnValue(root);
  return root;
}

async function loadModule() {
  vi.resetModules();
  return import("./session-request-anchors.server");
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

describe("session-request-anchors.server", () => {
  it("persists request anchors by session ID and caller-generated message ID", async () => {
    const root = createTempRoot();
    const module = await loadModule();

    module.saveSessionRequestAnchor({
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

    expect(existsSync(module.getSessionRequestAnchorStatePath(root))).toBe(true);
    expect(module.listSessionRequestAnchors("session-1")).toMatchObject({
      "user-1": {
        requested: {
          agent: "Sisyphus (Ultraworker)",
          model: {
            providerID: "github-copilot",
            modelID: "gpt-5-mini",
            variant: "high",
          },
        },
      },
    });
  });
});