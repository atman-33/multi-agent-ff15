import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMission, deleteMission, setWorkerSession } from "@/lib/mission-store";
import { readTmuxActiveMission, writeTmuxActiveMission } from "@/lib/tmux-active-mission.server";

const { resolveOwnerEndpointTargetMock, sessionListMock, sessionStatusMock } = vi.hoisted(() => ({
  resolveOwnerEndpointTargetMock: vi.fn(),
  sessionListMock: vi.fn(),
  sessionStatusMock: vi.fn(),
}));

vi.mock("@/lib/session-owner-routing.server", () => ({
  resolveOwnerEndpointTarget: resolveOwnerEndpointTargetMock,
}));

import { action } from "./route";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const originalPath = process.env.PATH ?? "";
const tempRoots: string[] = [];
const missionIds: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-switch-pane-session-"));
  tempRoots.push(root);
  mkdirSync(join(root, "runtime"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "bin"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

function installFakeTmux(root: string): string {
  const logPath = join(root, "tmux.log");
  writeFileSync(
    join(root, "bin", "tmux"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${logPath}"
`,
    { encoding: "utf-8", mode: 0o755 }
  );
  writeFileSync(
    join(root, "bin", "sleep"),
    `#!/usr/bin/env bash
set -euo pipefail
exit 0
`,
    { encoding: "utf-8", mode: 0o755 },
  );
  process.env.PATH = `${join(root, "bin")}:${originalPath}`;
  return logPath;
}

afterEach(() => {
  sessionListMock.mockReset();
  sessionStatusMock.mockReset();
  resolveOwnerEndpointTargetMock.mockReset();

  for (const missionId of missionIds.splice(0)) {
    deleteMission(missionId);
  }

  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }
  process.env.PATH = originalPath;

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("api.missions.$missionId.agents.$agentId.switch-pane-session", () => {
  beforeEach(() => {
    resolveOwnerEndpointTargetMock.mockReturnValue({
      client: {
        session: {
          list: sessionListMock,
          status: sessionStatusMock,
        },
      },
      endpointUrl: "http://127.0.0.1:4401",
      managedSession: null,
      mode: "managed",
      ownedSession: null,
      ownerAgent: "ignis",
    });
  });

  it("switches the worker pane to the current mission session without changing tmux write focus", async () => {
    const root = createTempRoot();
    const tmuxLog = installFakeTmux(root);
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const missionId = `mission-switch-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, `session-${missionId}`, {
      title: "Switch Pane Session",
      objective: "Inspect worker mission session",
      allowedWorkers: ["ignis", "gladiolus", "prompto"],
    });
    setWorkerSession(missionId, "ignis", "session-ignis");

    writeTmuxActiveMission(root, {
      missionId: "other-mission",
      updatedAt: "2026-05-08T00:00:00.000Z",
    });

    sessionStatusMock.mockResolvedValue({
      data: {
        "session-ignis": "idle",
      },
    });
    sessionListMock.mockResolvedValue({
      data: [
        {
          id: "session-ignis",
          title: `mission:${missionId}:ignis`,
        },
      ],
    });

    const response = await action({
      request: new Request(
        `http://localhost/api/missions/${missionId}/agents/ignis/switch-pane-session`,
        {
          method: "POST",
        }
      ),
      params: {
        missionId,
        agentId: "ignis",
      },
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      missionId,
      agentId: "ignis",
      sessionId: "session-ignis",
      sessionTitle: `mission:${missionId}:ignis`,
    });

    expect(readFileSync(tmuxLog, "utf-8").trim().split("\n")).toEqual([
      "send-keys -t ff15:main.1 C-p",
      "send-keys -t ff15:main.1 -l Switch session",
      "send-keys -t ff15:main.1 Enter",
      `send-keys -t ff15:main.1 -l mission:${missionId}:ignis`,
      "send-keys -t ff15:main.1 Enter",
    ]);
    expect(readTmuxActiveMission(root)).toEqual({
      missionId: "other-mission",
      updatedAt: "2026-05-08T00:00:00.000Z",
    });
  });

  it("switches the pane even when the target mission session is busy", async () => {
    const root = createTempRoot();
    const tmuxLog = installFakeTmux(root);
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const missionId = `mission-busy-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, `session-${missionId}`, {
      title: "Busy Pane Session",
      objective: "Protect active agent pane",
      allowedWorkers: ["ignis", "gladiolus", "prompto"],
    });
    setWorkerSession(missionId, "ignis", "session-ignis-busy");

    sessionStatusMock.mockResolvedValue({
      data: {
        "session-ignis-busy": "busy",
      },
    });
    sessionListMock.mockResolvedValue({
      data: [
        {
          id: "session-ignis-busy",
          title: `mission:${missionId}:ignis`,
        },
      ],
    });

    const response = await action({
      request: new Request(
        `http://localhost/api/missions/${missionId}/agents/ignis/switch-pane-session`,
        {
          method: "POST",
        }
      ),
      params: {
        missionId,
        agentId: "ignis",
      },
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      missionId,
      agentId: "ignis",
      sessionId: "session-ignis-busy",
      sessionTitle: `mission:${missionId}:ignis`,
    });
    expect(readFileSync(tmuxLog, "utf-8").trim().split("\n")).toEqual([
      "send-keys -t ff15:main.1 C-p",
      "send-keys -t ff15:main.1 -l Switch session",
      "send-keys -t ff15:main.1 Enter",
      `send-keys -t ff15:main.1 -l mission:${missionId}:ignis`,
      "send-keys -t ff15:main.1 Enter",
    ]);
  });

  it("rejects the switch when the mission has no session for the requested agent", async () => {
    const missionId = `mission-missing-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, `session-${missionId}`, {
      title: "Missing Session",
      objective: "Reject absent worker mission session",
      allowedWorkers: ["ignis", "gladiolus", "prompto"],
    });

    const response = await action({
      request: new Request(
        `http://localhost/api/missions/${missionId}/agents/ignis/switch-pane-session`,
        {
          method: "POST",
        }
      ),
      params: {
        missionId,
        agentId: "ignis",
      },
    } as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Mission session not found" });
    expect(resolveOwnerEndpointTargetMock).not.toHaveBeenCalled();
  });

  it("uses the stored legacy title when switching a primary-agent pane session", async () => {
    const root = createTempRoot();
    const tmuxLog = installFakeTmux(root);
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const missionId = `mission-primary-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis-legacy", {
      title: "Primary Session Legacy",
      objective: "Support legacy primary session titles",
      allowedWorkers: ["ignis", "gladiolus", "prompto"],
    });

    sessionStatusMock.mockResolvedValue({
      data: {
        "session-noctis-legacy": "idle",
      },
    });
    sessionListMock.mockResolvedValue({
      data: [
        {
          id: "session-noctis-legacy",
          title: `mission:${missionId}`,
        },
      ],
    });

    const response = await action({
      request: new Request(
        `http://localhost/api/missions/${missionId}/agents/noctis/switch-pane-session`,
        {
          method: "POST",
        }
      ),
      params: {
        missionId,
        agentId: "noctis",
      },
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      missionId,
      agentId: "noctis",
      sessionId: "session-noctis-legacy",
      sessionTitle: `mission:${missionId}`,
    });
    expect(readFileSync(tmuxLog, "utf-8")).toContain(
      `send-keys -t ff15:main.0 -l mission:${missionId}`
    );
  });
});
