import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { listPrimaryAgentOutboxItems } from "@/lib/mission-primary-agent-outbox.server";
import {
  createMission,
  deleteMission,
  getMission,
  getMissionPrimarySessionId,
  setWorkerSession,
} from "@/lib/mission-store";
import { readTmuxActiveMission, writeTmuxActiveMission } from "@/lib/tmux-active-mission.server";

const {
  ownerSessionCreateMock,
  ownerSessionListMock,
  ownerSessionMessagesMock,
  ownerSessionStatusMock,
  promptAsyncMock,
  sessionCreateMock,
  sessionMessagesMock,
  sessionListMock,
  sessionStatusMock,
} = vi.hoisted(() => ({
  ownerSessionCreateMock: vi.fn(),
  ownerSessionListMock: vi.fn(),
  ownerSessionMessagesMock: vi.fn(),
  ownerSessionStatusMock: vi.fn(),
  promptAsyncMock: vi.fn(),
  sessionCreateMock: vi.fn(),
  sessionMessagesMock: vi.fn(),
  sessionListMock: vi.fn(),
  sessionStatusMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  createProjectOpencodeClient: () => ({
    session: {
      create: ownerSessionCreateMock,
      list: ownerSessionListMock,
      messages: ownerSessionMessagesMock,
      promptAsync: promptAsyncMock,
      status: ownerSessionStatusMock,
    },
  }),
  getOpencodeClient: () => ({
    session: {
      create: sessionCreateMock,
      list: sessionListMock,
      messages: sessionMessagesMock,
      promptAsync: promptAsyncMock,
      status: sessionStatusMock,
    },
  }),
}));

import { action as continueAction } from "./api.noctis.mission.continue";
import { action as startAction } from "./api.noctis.mission.start";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const originalFetch = globalThis.fetch;
const repoRoot = getProjectRoot();

function initializeGitProject(projectRoot: string): void {
  writeFileSync(join(projectRoot, "AGENTS.md"), "# Agents\n", "utf-8");
  writeFileSync(join(projectRoot, "README.md"), "# Alpha\n", "utf-8");
  execSync("git init -b main", { cwd: projectRoot, stdio: "ignore" });
  execSync('git config user.email "test@example.com"', { cwd: projectRoot, stdio: "ignore" });
  execSync('git config user.name "Test User"', { cwd: projectRoot, stdio: "ignore" });
  execSync("git add README.md AGENTS.md", { cwd: projectRoot, stdio: "ignore" });
  execSync('git commit -m "init"', { cwd: projectRoot, stdio: "ignore" });
}

function createTempRoot(options?: {
  gitBacked?: boolean;
  transportMode?: "app-owned" | "tmux-resident";
}): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-mission-workspace-"));
  tempRoots.push(root);
  cpSync(join(repoRoot, "builtins"), join(root, "builtins"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");

  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "projects", "alpha"), { recursive: true });
  mkdirSync(join(root, "external-alpha"), { recursive: true });
  if (options?.gitBacked !== false) {
    initializeGitProject(join(root, "external-alpha"));
  }

  writeFileSync(
    join(root, "config", "settings.yaml"),
    [
      "language: ja",
      `transport_mode: "${options?.transportMode ?? "app-owned"}"`,
      'execution_workspace_root: ".worktrees"',
      "",
    ].join("\n"),
    "utf-8"
  );
  writeFileSync(
    join(root, "projects", "alpha", "project.yaml"),
    [
      'id: "alpha"',
      'name: "Alpha Project"',
      'root_path: "../../external-alpha"',
      'default_base_branch: "main"',
      'serena_project: "alpha"',
      "instruction_files:",
      '  - path: "../../external-alpha/AGENTS.md"',
      "    enabled: true",
      "",
    ].join("\n"),
    "utf-8"
  );
  mkdirSync(join(root, "projects", "beta"), { recursive: true });
  writeFileSync(
    join(root, "projects", "beta", "project.yaml"),
    [
      'id: "beta"',
      'name: "Beta Project"',
      'root_path: "../../external-alpha"',
      'serena_project: "beta"',
      "",
    ].join("\n"),
    "utf-8"
  );

  return root;
}

function writeHealthyTmuxTransportBootstrapArtifacts(root: string): void {
  mkdirSync(join(root, "runtime"), { recursive: true });
  writeFileSync(
    join(root, "runtime", "opencode-endpoints.json"),
    `${JSON.stringify(
      {
        version: 1,
        startedAt: "2026-04-28T00:00:00.000Z",
        agents: [
          {
            agentId: "noctis",
            port: 4401,
            url: "http://127.0.0.1:4401",
          },
        ],
      },
      null,
      2
    )}\n`,
    "utf-8"
  );
  writeFileSync(
    join(root, "runtime", "tmux-transport-dispatcher.json"),
    `${JSON.stringify(
      {
        version: 1,
        owner: "standby",
        mode: "tmux-resident",
        pid: process.pid,
        startedAt: "2026-04-28T00:00:00.000Z",
      },
      null,
      2
    )}\n`,
    "utf-8"
  );
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

afterEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = originalFetch;
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
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("Noctis mission execution workspace lifecycle", () => {
  it("provisions a shared clone workspace on mission start when dedicated workspace is selected", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    sessionCreateMock.mockResolvedValue({ data: { id: "session-noctis-start" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-start" } });

    const response = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Implement execution workspace lifecycle.",
          executionProjectId: "alpha",
          executionTargetMode: "mission_workspace",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{ missionId: string }>(response);
    missionIds.push(data.missionId);

    const mission = getMission(data.missionId);
    expect(mission?.executionProjectId).toBe("alpha");
    expect(mission?.contextProjectIds).toEqual([]);
    expect(mission?.baseBranch).toBe("main");
    expect(mission?.branch).toMatch(/^mission\//);
    expect(mission?.workspaceStatus).toBe("ready");
    expect(mission?.workspacePath).toBeTruthy();
    expect(existsSync(mission?.workspacePath ?? "")).toBe(true);
    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: process.env.MULTI_AGENT_FF15_ROOT,
        title: `mission:${data.missionId}:noctis`,
      })
    );
  });

  it("blocks dedicated-workspace mission start when the selected execution project is not git-backed", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot({ gitBacked: false });

    const response = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "This should fail.",
          executionProjectId: "alpha",
          executionTargetMode: "mission_workspace",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(409);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: "Execution project must point to a git repository.",
    });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("refuses mission start when tmux transport bootstrap is unhealthy", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot({ transportMode: "tmux-resident" });

    const response = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Start through tmux transport.",
          executionProjectId: "alpha",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(503);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: expect.stringContaining("Missing tmux transport endpoint manifest"),
    });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("enqueues tmux-resident mission start payloads instead of dispatching them inline", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeHealthyTmuxTransportBootstrapArtifacts(root);
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-tmux-start" } });

    const response = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Start through tmux transport.",
          executionProjectId: "alpha",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{ missionId: string; noctisSessionId: string }>(response);
    missionIds.push(data.missionId);

    expect(data.noctisSessionId).toBe("session-tmux-start");
    expect(promptAsyncMock).not.toHaveBeenCalled();
    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(ownerSessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${data.missionId}:noctis`,
      })
    );

    const queuedItems = listPrimaryAgentOutboxItems(data.missionId);
    expect(queuedItems).toHaveLength(1);
    expect(queuedItems[0]).toMatchObject({
      status: "pending",
      payload: {
        agent: "noctis",
        sessionId: "session-tmux-start",
        sessionTitle: `mission:${data.missionId}:noctis`,
        parts: [
          {
            type: "text",
            text: expect.stringContaining('<user-request from="user" to="noctis">') as never,
          },
        ],
      },
    });

    const mission = getMission(data.missionId);
    expect(mission?.activityLog).toContainEqual(
      expect.objectContaining({
        kind: "system_event",
        body: "Queued primary-agent tmux delivery.",
      })
    );
    expect(mission?.activityLog.map((entry) => entry.body).join("\n") ?? "").not.toContain(
      "Start through tmux transport."
    );
  });

  it("creates tmux-resident Noctis mission sessions on the owner endpoint", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeHealthyTmuxTransportBootstrapArtifacts(root);
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-owner-start" } });

    const response = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Start through the Noctis owner endpoint.",
          executionProjectId: "alpha",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{ missionId: string; noctisSessionId: string }>(response);
    missionIds.push(data.missionId);

    expect(data.noctisSessionId).toBe("session-owner-start");
    expect(ownerSessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${data.missionId}:noctis`,
      })
    );
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("blocks tmux mission start when another writable mission is still busy", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeHealthyTmuxTransportBootstrapArtifacts(root);
    const activeMission = createMission(
      `mission-tmux-active-${crypto.randomUUID()}`,
      "session-active",
      {
        title: "Active tmux mission",
        objective: "Own the writable tmux focus",
        allowedWorkers: [],
        executionProjectId: "alpha",
        executionTargetMode: "execution_project",
      }
    );
    missionIds.push(activeMission.id);
    writeTmuxActiveMission(root, {
      missionId: activeMission.id,
      updatedAt: "2026-04-29T00:00:00.000Z",
    });
    ownerSessionStatusMock.mockResolvedValue({
      data: {
        "session-active": "busy",
      },
      error: null,
    });

    const response = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Start through tmux transport while another mission is busy.",
          executionProjectId: "alpha",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(409);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: expect.stringContaining(activeMission.id),
    });
    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(promptAsyncMock).not.toHaveBeenCalled();
  });

  it("defaults new missions to the execution project root when executionTargetMode is omitted", async () => {
    const root = createTempRoot({ gitBacked: false });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    sessionCreateMock.mockResolvedValue({ data: { id: "session-noctis-default-direct" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-default-direct" } });

    const response = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Use the new default execution mode.",
          executionProjectId: "alpha",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{ missionId: string }>(response);
    missionIds.push(data.missionId);

    const mission = getMission(data.missionId);
    expect(mission?.executionProjectId).toBe("alpha");
    expect(mission?.executionTargetMode).toBe("execution_project");
    expect(mission?.workspacePath).toBeUndefined();
    expect(mission?.workspaceStatus).toBeUndefined();
    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${data.missionId}:noctis`,
      })
    );
  });

  it("starts direct-mode missions in the execution project root without provisioning a workspace", async () => {
    const root = createTempRoot({ gitBacked: false });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    sessionCreateMock.mockResolvedValue({ data: { id: "session-noctis-direct" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-direct" } });

    const response = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Start directly in the execution project.",
          executionProjectId: "alpha",
          executionTargetMode: "execution_project",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{ missionId: string }>(response);
    missionIds.push(data.missionId);

    const mission = getMission(data.missionId);
    expect(mission?.executionProjectId).toBe("alpha");
    expect(mission?.executionTargetMode).toBe("execution_project");
    expect(mission?.baseBranch).toBeUndefined();
    expect(mission?.branch).toBeUndefined();
    expect(mission?.workspacePath).toBeUndefined();
    expect(mission?.workspaceStatus).toBeUndefined();
    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${data.missionId}:noctis`,
      })
    );
  });

  it("persists explicit context projects selected before mission start", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    sessionCreateMock.mockResolvedValue({ data: { id: "session-noctis-context" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-context" } });

    const response = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Start with explicit context.",
          executionProjectId: "alpha",
          contextProjectIds: ["beta", "alpha", "beta"],
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{ missionId: string }>(response);
    missionIds.push(data.missionId);

    expect(getMission(data.missionId)?.executionTargetMode).toBe("execution_project");
    expect(getMission(data.missionId)?.contextProjectIds).toEqual(["beta"]);
  });

  it("recreates a missing workspace and fresh Noctis session on continue", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    sessionCreateMock
      .mockResolvedValueOnce({ data: { id: "session-noctis-start" } })
      .mockResolvedValueOnce({ data: { id: "session-noctis-recreated" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt" } });

    const startResponse = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Implement execution workspace lifecycle.",
          executionProjectId: "alpha",
          executionTargetMode: "mission_workspace",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(startResponse.status).toBe(200);
    const { missionId } = await readJson<{ missionId: string }>(startResponse);
    missionIds.push(missionId);

    const mission = getMission(missionId);
    setWorkerSession(missionId, "ignis", "worker-old");
    rmSync(mission?.workspacePath ?? "", { recursive: true, force: true });

    const continueResponse = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId,
          message: "Resume on a recreated workspace.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(continueResponse.status).toBe(200);
    expect(await readJson<{ noctisSessionId: string }>(continueResponse)).toEqual({
      noctisSessionId: "session-noctis-recreated",
    });
    expect(sessionCreateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        directory: process.env.MULTI_AGENT_FF15_ROOT,
        title: `mission:${missionId}:noctis`,
      })
    );
    expect(getMission(missionId)?.noctisSessionId).toBe("session-noctis-recreated");
    expect(getMission(missionId)?.workerSessions).toEqual({});
    expect(existsSync(getMission(missionId)?.workspacePath ?? "")).toBe(true);
  });

  it("continues direct-mode missions from the execution project root without workspace metadata", async () => {
    const root = createTempRoot({ gitBacked: false });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const mission = createMission(`mission-direct-${crypto.randomUUID()}`, "", {
      title: "Direct mission",
      objective: "Resume directly in the execution project",
      allowedWorkers: [],
      executionProjectId: "alpha",
      executionTargetMode: "execution_project",
    });
    missionIds.push(mission.id);
    sessionCreateMock.mockResolvedValue({ data: { id: "session-noctis-direct-continued" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-direct-continue" } });

    const response = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          message: "Resume directly in the execution project.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(await readJson<{ noctisSessionId: string }>(response)).toEqual({
      noctisSessionId: "session-noctis-direct-continued",
    });
    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${mission.id}:noctis`,
      })
    );
    expect(getMission(mission.id)?.noctisSessionId).toBe("session-noctis-direct-continued");
  });

  it("blocks continue for legacy missions without an execution project", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    const mission = createMission(`mission-legacy-${crypto.randomUUID()}`, "session-legacy", {
      title: "Legacy mission",
      objective: "Needs execution project assignment",
      allowedWorkers: [],
    });
    missionIds.push(mission.id);

    const response = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          message: "Attempt to resume a legacy mission.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(409);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: "Mission requires an execution project before it can be resumed.",
    });
  });

  it("blocks continue for missions with an unsupported runtime format", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const missionId = `mission-unsupported-${crypto.randomUUID()}`;
    missionIds.push(missionId);

    mkdirSync(join(root, "runtime", "noctis-missions", missionId), { recursive: true });
    writeFileSync(
      join(root, "runtime", "noctis-missions", missionId, "mission.json"),
      `${JSON.stringify(
        {
          id: missionId,
          noctisSessionId: "session-legacy",
          primarySessionId: "session-legacy",
          executionProjectId: "alpha",
          executionTargetMode: "execution_project",
          contextProjectIds: [],
          workerSessions: {},
          allowedWorkers: [],
          taskGraph: [],
          delegationLedger: {
            missionId,
            activeTasks: [],
            completedSummaries: {},
          },
          agentModels: {},
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z",
          title: "Unsupported mission",
          status: "active",
          messageLog: [],
          activityLog: [],
        },
        null,
        2
      )}\n`,
      "utf-8"
    );

    const response = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId,
          message: "Attempt to resume an unsupported mission.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(409);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: "Mission uses an unsupported runtime format and can no longer be resumed.",
    });
  });

  it("continues to require tmux readiness based on the mission transport snapshot", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const mission = createMission(`mission-tmux-snapshot-${crypto.randomUUID()}`, "session-tmux", {
      title: "Tmux snapshot mission",
      objective: "Keep using the stored tmux transport mode",
      allowedWorkers: [],
      executionProjectId: "alpha",
      executionTargetMode: "execution_project",
    });
    missionIds.push(mission.id);

    writeFileSync(
      join(root, "config", "settings.yaml"),
      [
        "language: ja",
        'transport_mode: "app-owned"',
        'execution_workspace_root: ".worktrees"',
        "",
      ].join("\n"),
      "utf-8"
    );

    const response = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          message: "Resume through the stored tmux transport mode.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(503);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: expect.stringContaining("Missing tmux transport endpoint manifest"),
    });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("continues app-owned missions even after the global transport mode changes to tmux-resident", async () => {
    const root = createTempRoot({ transportMode: "app-owned" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const mission = createMission(
      `mission-app-owned-snapshot-${crypto.randomUUID()}`,
      "session-app-owned",
      {
        title: "App-owned snapshot mission",
        objective: "Keep using the stored app-owned transport mode",
        allowedWorkers: [],
        executionProjectId: "alpha",
        executionTargetMode: "execution_project",
      }
    );
    missionIds.push(mission.id);
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-app-owned-continue" } });

    writeFileSync(
      join(root, "config", "settings.yaml"),
      [
        "language: ja",
        'transport_mode: "tmux-resident"',
        'execution_workspace_root: ".worktrees"',
        "",
      ].join("\n"),
      "utf-8"
    );

    const response = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          message: "Resume through the stored app-owned transport mode.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(await readJson<{ noctisSessionId: string }>(response)).toEqual({
      noctisSessionId: "session-app-owned",
    });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("enqueues tmux-resident mission continue payloads instead of dispatching them inline", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeHealthyTmuxTransportBootstrapArtifacts(root);
    const mission = createMission(
      `mission-tmux-enqueue-${crypto.randomUUID()}`,
      "session-tmux-existing",
      {
        title: "Tmux queued mission",
        objective: "Resume through tmux outbox",
        allowedWorkers: [],
        executionProjectId: "alpha",
        executionTargetMode: "execution_project",
      }
    );
    missionIds.push(mission.id);
    ownerSessionListMock.mockResolvedValue({
      data: [
        {
          id: "session-tmux-existing",
          title: `mission:${mission.id}`,
        },
      ],
      error: null,
    });

    const response = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          message: "Resume through tmux transport.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(await readJson<{ noctisSessionId: string }>(response)).toEqual({
      noctisSessionId: "session-tmux-existing",
    });
    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(promptAsyncMock).not.toHaveBeenCalled();
    expect(sessionListMock).not.toHaveBeenCalled();

    const queuedItems = listPrimaryAgentOutboxItems(mission.id);
    expect(queuedItems).toHaveLength(1);
    expect(queuedItems[0]).toMatchObject({
      status: "pending",
      payload: {
        agent: "noctis",
        sessionId: getMissionPrimarySessionId(getMission(mission.id)) ?? "session-tmux-existing",
        sessionTitle: `mission:${mission.id}`,
      },
    });

    const activityBody =
      getMission(mission.id)
        ?.activityLog.map((entry) => entry.body)
        .join("\n") ?? "";
    expect(activityBody).toContain("Queued primary-agent tmux delivery.");
    expect(activityBody).not.toContain("Resume through tmux transport.");
  });

  it("keeps a tmux-resident Noctis session when owner session metadata still resolves", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeHealthyTmuxTransportBootstrapArtifacts(root);
    const mission = createMission(
      `mission-tmux-history-${crypto.randomUUID()}`,
      "session-tmux-existing",
      {
        title: "Tmux continuity mission",
        objective: "Resume without recreating a readable Noctis owner session",
        allowedWorkers: [],
        executionProjectId: "alpha",
        executionTargetMode: "execution_project",
      }
    );
    missionIds.push(mission.id);
    ownerSessionListMock.mockResolvedValue({
      data: [
        {
          id: "session-other",
          title: "unrelated-session",
        },
      ],
      error: null,
    });
    globalThis.fetch = vi.fn(async (input) => {
      expect(String(input)).toBe("http://127.0.0.1:4401/session/session-tmux-existing");
      return new Response(JSON.stringify({ id: "session-tmux-existing" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-owner-recreated" } });

    const response = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          message: "Resume through tmux transport without recreating the owner session.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(await readJson<{ noctisSessionId: string }>(response)).toEqual({
      noctisSessionId: "session-tmux-existing",
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(ownerSessionMessagesMock).not.toHaveBeenCalled();
    expect(ownerSessionCreateMock).not.toHaveBeenCalled();
    expect(promptAsyncMock).not.toHaveBeenCalled();

    const queuedItems = listPrimaryAgentOutboxItems(mission.id);
    expect(queuedItems).toHaveLength(1);
    expect(queuedItems[0]).toMatchObject({
      status: "pending",
      payload: {
        agent: "noctis",
        sessionId: "session-tmux-existing",
        sessionTitle: `mission:${mission.id}:noctis`,
      },
    });
    expect(getMissionPrimarySessionId(getMission(mission.id))).toBe("session-tmux-existing");
  });

  it("recreates a tmux-resident Noctis session on the owner endpoint when the stored session is missing", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeHealthyTmuxTransportBootstrapArtifacts(root);
    const mission = createMission(
      `mission-tmux-rebind-${crypto.randomUUID()}`,
      "session-stale-default",
      {
        title: "Tmux rebound mission",
        objective: "Repair a stale Noctis owner session",
        allowedWorkers: [],
        executionProjectId: "alpha",
        executionTargetMode: "execution_project",
      }
    );
    missionIds.push(mission.id);
    ownerSessionListMock
      .mockResolvedValueOnce({
        data: [
          {
            id: "session-other",
            title: "unrelated-session",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "session-owner-recreated",
            title: `mission:${mission.id}:noctis`,
          },
        ],
        error: null,
      });
    globalThis.fetch = vi.fn(async (input) => {
      expect(String(input)).toBe("http://127.0.0.1:4401/session/session-stale-default");
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-owner-recreated" } });

    const response = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          message: "Repair the Noctis owner session.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(await readJson<{ noctisSessionId: string }>(response)).toEqual({
      noctisSessionId: "session-owner-recreated",
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(ownerSessionMessagesMock).not.toHaveBeenCalled();
    expect(ownerSessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${mission.id}:noctis`,
      })
    );
    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(getMission(mission.id)?.noctisSessionId).toBe("session-owner-recreated");

    const queuedItems = listPrimaryAgentOutboxItems(mission.id);
    expect(queuedItems).toHaveLength(1);
    expect(queuedItems[0]).toMatchObject({
      payload: {
        agent: "noctis",
        sessionId: "session-owner-recreated",
        sessionTitle: `mission:${mission.id}:noctis`,
      },
    });
  });

  it("refuses mission continue when tmux transport bootstrap is unhealthy", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot({ transportMode: "tmux-resident" });
    const mission = createMission(`mission-tmux-${crypto.randomUUID()}`, "", {
      title: "Tmux mission",
      objective: "Resume through tmux transport",
      allowedWorkers: [],
      executionProjectId: "alpha",
      executionTargetMode: "execution_project",
    });
    missionIds.push(mission.id);

    const response = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          message: "Resume through tmux transport.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(503);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: expect.stringContaining("Missing tmux transport endpoint manifest"),
    });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("blocks tmux mission continue when another writable mission is still busy", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeHealthyTmuxTransportBootstrapArtifacts(root);

    const activeMission = createMission(
      `mission-tmux-active-${crypto.randomUUID()}`,
      "session-active",
      {
        title: "Active tmux mission",
        objective: "Own the writable tmux focus",
        allowedWorkers: [],
        executionProjectId: "alpha",
        executionTargetMode: "execution_project",
      }
    );
    const targetMission = createMission(
      `mission-tmux-target-${crypto.randomUUID()}`,
      "session-target",
      {
        title: "Target tmux mission",
        objective: "Attempt to continue while another mission is busy",
        allowedWorkers: [],
        executionProjectId: "alpha",
        executionTargetMode: "execution_project",
      }
    );
    missionIds.push(activeMission.id, targetMission.id);
    writeTmuxActiveMission(root, {
      missionId: activeMission.id,
      updatedAt: "2026-04-29T00:00:00.000Z",
    });
    ownerSessionStatusMock.mockResolvedValue({
      data: {
        "session-active": "busy",
        "session-target": "idle",
      },
      error: null,
    });

    const response = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: targetMission.id,
          message: "Do not steal focus from the busy mission.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(409);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: expect.stringContaining(activeMission.id),
    });
    expect(promptAsyncMock).not.toHaveBeenCalled();
  });

  it("replaces tmux write focus when the previously active mission is idle", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeHealthyTmuxTransportBootstrapArtifacts(root);
    const activeMission = createMission(
      `mission-tmux-idle-${crypto.randomUUID()}`,
      "session-idle",
      {
        title: "Idle tmux mission",
        objective: "Yield writable focus when idle",
        allowedWorkers: [],
        executionProjectId: "alpha",
        executionTargetMode: "execution_project",
      }
    );
    const targetMission = createMission(
      `mission-tmux-target-${crypto.randomUUID()}`,
      "session-target",
      {
        title: "Target tmux mission",
        objective: "Take writable focus",
        allowedWorkers: [],
        executionProjectId: "alpha",
        executionTargetMode: "execution_project",
      }
    );
    missionIds.push(activeMission.id, targetMission.id);
    writeTmuxActiveMission(root, {
      missionId: activeMission.id,
      updatedAt: "2026-04-29T00:00:00.000Z",
    });
    ownerSessionStatusMock.mockResolvedValue({
      data: {
        "session-idle": "idle",
      },
      error: null,
    });
    ownerSessionListMock.mockResolvedValue({
      data: [
        {
          id: "session-target",
          title: `mission:${targetMission.id}`,
        },
      ],
      error: null,
    });

    const response = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: targetMission.id,
          message: "Resume after the previous tmux mission went idle.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(await readJson<{ noctisSessionId: string }>(response)).toEqual({
      noctisSessionId: "session-target",
    });
    expect(readTmuxActiveMission(root)).toMatchObject({
      missionId: targetMission.id,
    });
  });
});
