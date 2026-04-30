import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listOwnedSessionTmuxDispatchItems,
  queueOwnedSessionTmuxDispatch,
} from "./owned-session-transport.server";

const { spawnSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-dispatcher-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

afterEach(() => {
  spawnSyncMock.mockReset();

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

describe("tmux_transport_dispatcher", () => {
  it("submits owned Iris dispatches through pane 5 using the retained session title", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    spawnSyncMock.mockImplementation((file: string) => {
      if (file === "tmux" || file === "sleep") {
        return { status: 0, stderr: "", stdout: "" };
      }

      return { status: 1, stderr: `Unexpected command ${file}`, stdout: "" };
    });

    const dispatcherModulePath = "../../../scripts/tmux_transport_dispatcher";
    const { submitClaimedItem } = (await import(dispatcherModulePath)) as {
      submitClaimedItem: (root: string, item: ReturnType<typeof queueOwnedSessionTmuxDispatch>) => void;
    };
    const item = queueOwnedSessionTmuxDispatch({
      ownerAgent: "iris",
      sessionId: "session-iris",
      sessionTitle: "iris:projects",
      parts: [{ type: "text", text: "Refresh the project registry." }],
    });

    submitClaimedItem(root, item);

    const tmuxCalls = spawnSyncMock.mock.calls.filter(([file]) => file === "tmux");
    expect(
      tmuxCalls.some(
        ([, args]) =>
          Array.isArray(args) &&
          args[0] === "send-keys" &&
          args[2] === "ff15:main.5" &&
          args[4] === "Switch session",
      ),
    ).toBe(true);
    expect(
      tmuxCalls.some(
        ([, args]) =>
          Array.isArray(args) &&
          args[0] === "send-keys" &&
          args[2] === "ff15:main.5" &&
          args[4] === "iris:projects",
      ),
    ).toBe(true);
    expect(
      tmuxCalls.some(
        ([, args]) =>
          Array.isArray(args) &&
          args[0] === "send-keys" &&
          args[2] === "ff15:main.5" &&
          typeof args[4] === "string" &&
          args[4].includes("Refresh the project registry."),
      ),
    ).toBe(true);

    expect(listOwnedSessionTmuxDispatchItems("session-iris")).toEqual([
      expect.objectContaining({
        status: "submitted",
        submission: expect.objectContaining({
          submittedBy: expect.stringMatching(/^dispatcher:/),
        }),
      }),
    ]);
  });
});