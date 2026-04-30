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
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-owned-session-registry-"));
  tempRoots.push(root);
  getProjectRootMock.mockReturnValue(root);
  return root;
}

async function loadModule() {
  vi.resetModules();
  return import("./owned-session-registry.server");
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

describe("owned-session-registry.server", () => {
  it("persists Iris-owned tmux sessions by session ID", async () => {
    const root = createTempRoot();
    const module = await loadModule();

    const entry = module.saveOwnedSession({
      ownerAgent: "iris",
      sessionId: "session-iris-1",
      sessionTitle: "iris:projects",
      surface: "projects-iris",
      transportMode: "tmux-resident",
    });

    expect(existsSync(module.getOwnedSessionRegistryStatePath(root))).toBe(true);
    expect(entry).toMatchObject({
      ownerAgent: "iris",
      sessionTitle: "iris:projects",
      surface: "projects-iris",
      transportMode: "tmux-resident",
    });
    expect(entry.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(module.readOwnedSession("session-iris-1")).toEqual(entry);
    expect(module.listOwnedSessions()).toMatchObject({
      "session-iris-1": entry,
    });
  });
});