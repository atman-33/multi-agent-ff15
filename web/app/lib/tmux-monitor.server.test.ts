import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  getConfiguredMissionTransportStatusMock,
  listSessionStatusTargetsMock,
  spawnSyncMock,
} = vi.hoisted(() => ({
  getConfiguredMissionTransportStatusMock: vi.fn(),
  listSessionStatusTargetsMock: vi.fn(),
  spawnSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

vi.mock("./tmux-transport-bootstrap.server", () => ({
  getConfiguredMissionTransportStatus: getConfiguredMissionTransportStatusMock,
}));

vi.mock("./session-owner-routing.server", () => ({
  listSessionStatusTargets: listSessionStatusTargetsMock,
}));

import { readTmuxMonitorSnapshot } from "./tmux-monitor.server";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-tmux-monitor-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

afterEach(() => {
  getConfiguredMissionTransportStatusMock.mockReset();
  listSessionStatusTargetsMock.mockReset();
  spawnSyncMock.mockReset();

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("tmux-monitor.server", () => {
  it("collects pane output and per-agent status in tmux-resident mode", async () => {
    const root = createTempRoot();

    getConfiguredMissionTransportStatusMock.mockResolvedValue({
      bootstrapStatus: {
        agentCount: 6,
        dispatcherPid: 4321,
        error: null,
        isReady: true,
        lastStartedAt: "2026-05-01T00:00:00.000Z",
      },
      error: null,
      isReady: true,
      transportMode: "tmux-resident",
    });

    listSessionStatusTargetsMock.mockReturnValue([
      {
        agentId: "noctis",
        client: {
          session: {
            status: vi.fn().mockResolvedValue({
              data: {
                "session-noctis": { type: "busy" },
              },
              error: null,
            }),
          },
        },
      },
      {
        agentId: "ignis",
        client: {
          session: {
            status: vi.fn().mockResolvedValue({
              data: {
                "session-ignis": { type: "idle" },
              },
              error: null,
            }),
          },
        },
      },
    ]);

    spawnSyncMock.mockImplementation((_file: string, args?: string[]) => {
      const target = Array.isArray(args) ? args[2] : "";
      if (target === "ff15:main.0") {
        return { status: 0, stderr: "", stdout: "Noctis pane output\n" };
      }
      if (target === "ff15:main.1") {
        return { status: 0, stderr: "", stdout: "Ignis pane output\n" };
      }

      return { status: 1, stderr: "missing pane", stdout: "" };
    });

    const snapshot = await readTmuxMonitorSnapshot(root);

    expect(snapshot.transportMode).toBe("tmux-resident");
    expect(snapshot.bootstrapStatus).toMatchObject({
      dispatcherPid: 4321,
      isReady: true,
    });
    expect(snapshot.agentStatuses).toMatchObject({
      ignis: "idle",
      noctis: "busy",
    });
    expect(snapshot.panes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "noctis",
          content: "Noctis pane output\n",
          paneIndex: 0,
          target: "ff15:main.0",
        }),
        expect.objectContaining({
          agentId: "ignis",
          content: "Ignis pane output\n",
          paneIndex: 1,
          target: "ff15:main.1",
        }),
      ]),
    );
  });
});