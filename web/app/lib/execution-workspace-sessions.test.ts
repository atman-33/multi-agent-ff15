import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getProjectRoot } from "@/lib/get-project-root.server";
import { buildMissionResumePayload } from "@/lib/mission-api.server";
import {
  listTmuxDispatchItems,
  markTmuxDispatchItemSubmitted,
} from "@/lib/mission-primary-agent-outbox.server";
import { provisionMissionExecutionWorkspace } from "@/lib/mission-execution-workspace.server";
import {
  addTask,
  createMission,
  deleteMission,
  getMission,
  setWorkerSession,
  updateTask,
} from "@/lib/mission-store";
import { dispatchTaskToWorker } from "@/lib/task-dispatch.server";
import { writeTmuxActiveMission } from "@/lib/tmux-active-mission.server";
import { sendSimpleMessage, sendWorkerReport } from "@/lib/team-message.server";

const { createProjectOpencodeClientMock, ownerSessionCreateMock, promptAsyncMock, sessionCreateMock, sessionStatusMock } = vi.hoisted(() => ({
  createProjectOpencodeClientMock: vi.fn((baseUrl: string) => ({
    baseUrl,
    session: {
      create: ownerSessionCreateMock,
      promptAsync: promptAsyncMock,
      status: sessionStatusMock,
    },
  })),
  ownerSessionCreateMock: vi.fn(),
  promptAsyncMock: vi.fn(),
  sessionCreateMock: vi.fn(),
  sessionStatusMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  createProjectOpencodeClient: createProjectOpencodeClientMock,
  getOpencodeClient: () => ({
    session: {
      create: sessionCreateMock,
      promptAsync: promptAsyncMock,
      status: sessionStatusMock,
    },
  }),
}));

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
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

function createTempRoot(options?: { transportMode?: "app-owned" | "tmux-resident" }): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-execution-sessions-"));
  tempRoots.push(root);
  cpSync(join(repoRoot, "builtins"), join(root, "builtins"), { recursive: true });
  mkdirSync(join(root, "runtime"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");

  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "projects", "alpha"), { recursive: true });
  mkdirSync(join(root, "external-alpha"), { recursive: true });
  initializeGitProject(join(root, "external-alpha"));

  writeFileSync(
    join(root, "config", "settings.yaml"),
    [
      'language: ja',
      `transport_mode: "${options?.transportMode ?? "app-owned"}"`,
      'execution_workspace_root: ".worktrees"',
      '',
    ].join("\n"),
    "utf-8",
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
    "utf-8",
  );

  return root;
}

function writeEndpointManifest(
  root: string,
  agents: Array<{ agentId: string; port: number; url: string }>,
): void {
  writeFileSync(
    join(root, "runtime", "opencode-endpoints.json"),
    `${JSON.stringify(
      {
        version: 1,
        startedAt: "2026-04-29T00:00:00.000Z",
        agents,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

function createExecutionMission(root: string): {
  missionId: string;
  workspacePath: string;
} {
  const missionId = `mission-${crypto.randomUUID()}`;
  missionIds.push(missionId);
  const executionWorkspace = provisionMissionExecutionWorkspace({
    appRoot: root,
    createdAt: "2026-04-10T11:12:13.000Z",
    executionProjectId: "alpha",
    title: "Execution session mission",
  });

  createMission(missionId, "session-noctis", {
    title: "Execution session mission",
    objective: "Exercise worker session roots",
    allowedWorkers: [],
    executionProjectId: "alpha",
    contextProjectIds: ["beta"],
    baseBranch: executionWorkspace.baseBranch,
    branch: executionWorkspace.branch,
    workspacePath: executionWorkspace.workspacePath,
    workspaceStatus: executionWorkspace.workspaceStatus,
  });

  return {
    missionId,
    workspacePath: executionWorkspace.workspacePath,
  };
}

function createDirectExecutionMission(): string {
  const missionId = `mission-${crypto.randomUUID()}`;
  missionIds.push(missionId);

  createMission(missionId, "session-noctis", {
    title: "Direct execution mission",
    objective: "Exercise direct execution roots",
    allowedWorkers: [],
    executionProjectId: "alpha",
    executionTargetMode: "execution_project",
    contextProjectIds: [],
  });

  return missionId;
}

afterEach(() => {
  vi.clearAllMocks();
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

describe("execution workspace sessions", () => {
  it("uses the mission execution workspace for worker dispatch sessions", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    sessionCreateMock.mockResolvedValue({ data: { id: "session-ignis" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-worker" } });

    await dispatchTaskToWorker({
      missionId,
      agentId: "ignis",
      message: "Handle the task in the execution workspace.",
    });

    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${missionId}:ignis`,
      }),
    );
  });

  it("does not prepend delegation-ledger system text to the first direct worker dispatch", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    sessionCreateMock.mockResolvedValue({ data: { id: "session-ignis" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-worker" } });

    await dispatchTaskToWorker({
      missionId,
      agentId: "ignis",
      message: "Handle the task without bootstrap metadata.",
    });

    const promptInput = promptAsyncMock.mock.calls.at(-1)?.[0];
    expect(promptInput).toBeTruthy();
    expect(promptInput).not.toHaveProperty("system");
  });

  it("records directed handoff banter from the actual handoff source", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    sessionCreateMock.mockResolvedValue({ data: { id: "session-ignis" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-worker" } });

    await dispatchTaskToWorker({
      missionId,
      agentId: "ignis",
      message: "Continue with review.",
      fromAgent: "gladiolus",
      orchestratedBy: "noctis",
      stepName: "review",
    });

    expect(getMission(missionId)?.conversationLog).toEqual([
      expect.objectContaining({
        kind: "directed",
        fromAgent: "gladiolus",
        toAgent: "ignis",
        speakerAgent: "gladiolus",
        orchestratedBy: "noctis",
        cue: "task-delegated",
        stepName: "review",
      }),
      expect.objectContaining({
        kind: "directed",
        fromAgent: "gladiolus",
        toAgent: "ignis",
        speakerAgent: "ignis",
        orchestratedBy: "noctis",
        cue: "message-received",
        stepName: "review",
      }),
    ]);
  });

  it("recreates missing workspaces before dispatch and clears stale sessions", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId, workspacePath } = createExecutionMission(root);
    setWorkerSession(missionId, "prompto", "session-prompto-old");
    sessionCreateMock.mockResolvedValue({ data: { id: "session-ignis-new" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-worker" } });

    rmSync(workspacePath, { recursive: true, force: true });

    await dispatchTaskToWorker({
      missionId,
      agentId: "ignis",
      message: "Recover the missing execution workspace.",
    });

    expect(existsSync(workspacePath)).toBe(true);
    expect(getMission(missionId)?.noctisSessionId).toBe("");
    expect(getMission(missionId)?.workerSessions).toEqual({ ignis: "session-ignis-new" });
  });

  it("uses the execution project root for direct-mode worker dispatch sessions", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const missionId = createDirectExecutionMission();
    sessionCreateMock.mockResolvedValue({ data: { id: "session-ignis-direct" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-worker-direct" } });

    await dispatchTaskToWorker({
      missionId,
      agentId: "ignis",
      message: "Handle the task directly in the execution project.",
    });

    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${missionId}:ignis`,
      }),
    );
  });

  it("blocks worker dispatch when another tmux mission still owns writable focus", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const activeMission = createExecutionMission(root);
    const targetMission = createExecutionMission(root);
    writeTmuxActiveMission(root, {
      missionId: activeMission.missionId,
      updatedAt: "2026-04-29T00:00:00.000Z",
    });
    sessionStatusMock.mockResolvedValue({
      data: {
        "session-noctis": "busy",
      },
      error: null,
    });

    await expect(
      dispatchTaskToWorker({
        missionId: targetMission.missionId,
        agentId: "ignis",
        message: "Do not steal focus from the busy mission.",
      }),
    ).rejects.toThrow(activeMission.missionId);

    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(promptAsyncMock).not.toHaveBeenCalled();
  });

  it("creates tmux worker dispatch sessions on the worker owner endpoint", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    writeEndpointManifest(root, [
      {
        agentId: "ignis",
        port: 4403,
        url: "http://127.0.0.1:4403",
      },
    ]);
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-ignis-owner" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-worker-owner" } });

    await dispatchTaskToWorker({
      missionId,
      agentId: "ignis",
      message: "Create the tmux worker session on the worker endpoint.",
    });

    expect(createProjectOpencodeClientMock).toHaveBeenCalledWith("http://127.0.0.1:4403");
    expect(ownerSessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${missionId}:ignis`,
      }),
    );
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("creates tmux worker dispatch sessions on the Prompto owner endpoint", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    writeEndpointManifest(root, [
      {
        agentId: "prompto",
        port: 4404,
        url: "http://127.0.0.1:4404",
      },
    ]);
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-prompto-owner" } });

    await dispatchTaskToWorker({
      missionId,
      agentId: "prompto",
      message: "Prompto should receive delegated tmux work.",
    });

    expect(ownerSessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${missionId}:prompto`,
      }),
    );
    const queueItems = listTmuxDispatchItems(missionId);
    expect(queueItems).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          sessionId: "session-prompto-owner",
          agent: "prompto",
        }),
      }),
    ]);
  });

  it("queues tmux worker dispatches instead of prompting inline", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    writeEndpointManifest(root, [
      {
        agentId: "ignis",
        port: 4403,
        url: "http://127.0.0.1:4403",
      },
    ]);
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-ignis-queued" } });

    const result = await dispatchTaskToWorker({
      missionId,
      agentId: "ignis",
      message: "Queue this worker dispatch through tmux transport.",
    });

    expect(result).toEqual({
      sessionId: "session-ignis-queued",
      taskId: expect.any(String) as string,
    });
    expect(promptAsyncMock).not.toHaveBeenCalled();
    expect(listTmuxDispatchItems(missionId)).toEqual([
      expect.objectContaining({
        status: "pending",
        payload: expect.objectContaining({
          agent: "ignis",
          sessionId: "session-ignis-queued",
          sessionTitle: `mission:${missionId}:ignis`,
        }),
      }),
    ]);
    expect(listTmuxDispatchItems(missionId)[0]?.payload).not.toHaveProperty("system");
  });

  it("records queued transport state for tmux worker dispatches", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    writeEndpointManifest(root, [
      {
        agentId: "ignis",
        port: 4403,
        url: "http://127.0.0.1:4403",
      },
    ]);
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-ignis-pending" } });

    await dispatchTaskToWorker({
      missionId,
      agentId: "ignis",
      message: "Track queued transport state for this worker dispatch.",
    });

    expect(getMission(missionId)?.messageLog).toContainEqual(
      expect.objectContaining({
        toAgent: "ignis",
        deliveredToSessionId: "session-ignis-pending",
        deliveryStatus: "queued",
      }),
    );
    expect(getMission(missionId)?.conversationLog).toEqual([
      expect.objectContaining({
        transport: expect.objectContaining({
          deliveryStatus: "queued",
          sessionId: "session-ignis-pending",
        }),
      }),
      expect.objectContaining({
        transport: expect.objectContaining({
          deliveryStatus: "queued",
          sessionId: "session-ignis-pending",
        }),
      }),
    ]);
  });

  it("reconciles submitted tmux worker dispatches to sent transport state", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    writeEndpointManifest(root, [
      {
        agentId: "ignis",
        port: 4403,
        url: "http://127.0.0.1:4403",
      },
    ]);
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-ignis-submitted" } });

    await dispatchTaskToWorker({
      missionId,
      agentId: "ignis",
      message: "Reconcile queued tmux worker dispatch to sent state.",
    });

    const [item] = listTmuxDispatchItems(missionId);
    markTmuxDispatchItemSubmitted({
      missionId,
      itemId: item.id,
      submittedAt: "2026-05-01T00:00:00.000Z",
      submittedBy: "dispatcher:test",
    });

    const mission = getMission(missionId);
    expect(mission).toBeTruthy();
    if (!mission) {
      throw new Error("Expected mission to exist after dispatch submission.");
    }
    buildMissionResumePayload(mission);

    expect(getMission(missionId)?.messageLog).toContainEqual(
      expect.objectContaining({
        deliveredToSessionId: "session-ignis-submitted",
        deliveryStatus: "sent",
      }),
    );
    expect(getMission(missionId)?.conversationLog).toEqual([
      expect.objectContaining({
        transport: expect.objectContaining({
          deliveryStatus: "sent",
          sessionId: "session-ignis-submitted",
        }),
      }),
      expect.objectContaining({
        transport: expect.objectContaining({
          deliveryStatus: "sent",
          sessionId: "session-ignis-submitted",
        }),
      }),
    ]);
  });

  it("uses the mission execution workspace for team-message worker sessions", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    sessionCreateMock.mockResolvedValue({ data: { id: "session-ignis" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-message" } });

    await sendSimpleMessage({
      missionId,
      toAgent: "ignis",
      body: "Share the updated plan.",
      fromActor: "user",
    });

    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${missionId}:ignis`,
      }),
    );
  });

  it("records directed banter when Noctis sends a simple team message to a worker", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    sessionCreateMock.mockResolvedValue({ data: { id: "session-ignis" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-message" } });

    await sendSimpleMessage({
      missionId,
      toAgent: "ignis",
      body: "Share the updated plan.",
      fromActor: "user",
    });

    expect(getMission(missionId)?.conversationLog).toEqual([
      expect.objectContaining({
        kind: "directed",
        fromAgent: "noctis",
        toAgent: "ignis",
        speakerAgent: "noctis",
        orchestratedBy: "noctis",
        cue: "task-delegated",
        payload: expect.objectContaining({
          canonicalMessage: "Share the updated plan.",
        }),
      }),
      expect.objectContaining({
        kind: "directed",
        fromAgent: "noctis",
        toAgent: "ignis",
        speakerAgent: "ignis",
        orchestratedBy: "noctis",
        cue: "message-received",
      }),
    ]);
  });

  it("uses the execution project root for direct-mode team-message worker sessions", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const missionId = createDirectExecutionMission();
    sessionCreateMock.mockResolvedValue({ data: { id: "session-ignis-direct-message" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-message-direct" } });

    await sendSimpleMessage({
      missionId,
      toAgent: "ignis",
      body: "Share the updated plan directly from the execution project.",
      fromActor: "user",
    });

    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${missionId}:ignis`,
      }),
    );
  });

  it("blocks team-message delivery when another tmux mission still owns writable focus", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const activeMission = createExecutionMission(root);
    const targetMission = createExecutionMission(root);
    writeTmuxActiveMission(root, {
      missionId: activeMission.missionId,
      updatedAt: "2026-04-29T00:00:00.000Z",
    });
    sessionStatusMock.mockResolvedValue({
      data: {
        "session-noctis": "busy",
      },
      error: null,
    });

    await expect(
      sendSimpleMessage({
        missionId: targetMission.missionId,
        toAgent: "ignis",
        body: "Do not steal focus from the busy mission.",
        fromActor: "user",
      }),
    ).rejects.toThrow(activeMission.missionId);

    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(promptAsyncMock).not.toHaveBeenCalled();
  });

  it("does not block team-message delivery for completed tasks on the previous tmux mission", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const activeMission = createExecutionMission(root);
    const targetMission = createExecutionMission(root);
    addTask(activeMission.missionId, {
      id: "task-completed-focus-release",
      assignedTo: "ignis",
      dependencies: [],
      status: "pending",
      message: "Complete and release tmux focus.",
    });
    updateTask(
      activeMission.missionId,
      "task-completed-focus-release",
      "completed",
      "Completed work should not hold tmux focus.",
    );
    writeTmuxActiveMission(root, {
      missionId: activeMission.missionId,
      updatedAt: "2026-04-29T00:00:00.000Z",
    });
    writeEndpointManifest(root, [
      {
        agentId: "ignis",
        port: 4403,
        url: "http://127.0.0.1:4403",
      },
    ]);
    sessionStatusMock.mockResolvedValue({
      data: {
        "session-noctis": "idle",
      },
      error: null,
    });
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-ignis-completed-task-release" } });

    const result = await sendSimpleMessage({
      missionId: targetMission.missionId,
      toAgent: "ignis",
      body: "Completed tasks should not keep writable focus.",
      fromActor: "user",
    });

    expect(result).toMatchObject({
      sessionId: "session-ignis-completed-task-release",
      messageId: expect.any(String) as string,
    });
    expect(ownerSessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${targetMission.missionId}:ignis`,
      }),
    );
  });

  it("creates tmux team-message worker sessions on the worker owner endpoint", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    writeEndpointManifest(root, [
      {
        agentId: "ignis",
        port: 4403,
        url: "http://127.0.0.1:4403",
      },
    ]);
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-ignis-message-owner" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-message-owner" } });

    await sendSimpleMessage({
      missionId,
      toAgent: "ignis",
      body: "Route this tmux message through the worker endpoint.",
      fromActor: "user",
    });

    expect(createProjectOpencodeClientMock).toHaveBeenCalledWith("http://127.0.0.1:4403");
    expect(ownerSessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${missionId}:ignis`,
      }),
    );
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("queues tmux team messages instead of prompting inline", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    writeEndpointManifest(root, [
      {
        agentId: "ignis",
        port: 4403,
        url: "http://127.0.0.1:4403",
      },
    ]);
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-ignis-message-queued" } });

    const result = await sendSimpleMessage({
      missionId,
      toAgent: "ignis",
      body: "Queue this tmux team message.",
      fromActor: "user",
    });

    expect(result).toMatchObject({
      sessionId: "session-ignis-message-queued",
      messageId: expect.any(String) as string,
    });
    expect(promptAsyncMock).not.toHaveBeenCalled();
    expect(listTmuxDispatchItems(missionId)).toEqual([
      expect.objectContaining({
        status: "pending",
        payload: expect.objectContaining({
          agent: "ignis",
          sessionId: "session-ignis-message-queued",
          sessionTitle: `mission:${missionId}:ignis`,
        }),
      }),
    ]);
  });

  it("records queued transport state for tmux team messages", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    writeEndpointManifest(root, [
      {
        agentId: "ignis",
        port: 4403,
        url: "http://127.0.0.1:4403",
      },
    ]);
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-ignis-message-pending" } });

    await sendSimpleMessage({
      missionId,
      toAgent: "ignis",
      body: "Track queued transport state for this tmux message.",
      fromActor: "user",
    });

    expect(getMission(missionId)?.messageLog).toContainEqual(
      expect.objectContaining({
        toAgent: "ignis",
        deliveredToSessionId: "session-ignis-message-pending",
        deliveryStatus: "queued",
      }),
    );
    expect(getMission(missionId)?.conversationLog).toEqual([
      expect.objectContaining({
        transport: expect.objectContaining({
          deliveryStatus: "queued",
          sessionId: "session-ignis-message-pending",
        }),
      }),
      expect.objectContaining({
        transport: expect.objectContaining({
          deliveryStatus: "queued",
          sessionId: "session-ignis-message-pending",
        }),
      }),
    ]);
  });

  it("reconciles submitted tmux team messages to sent transport state", async () => {
    const root = createTempRoot({ transportMode: "tmux-resident" });
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    writeEndpointManifest(root, [
      {
        agentId: "ignis",
        port: 4403,
        url: "http://127.0.0.1:4403",
      },
    ]);
    ownerSessionCreateMock.mockResolvedValue({ data: { id: "session-ignis-message-submitted" } });

    await sendSimpleMessage({
      missionId,
      toAgent: "ignis",
      body: "Reconcile tmux submission to sent state.",
      fromActor: "user",
    });

    const [item] = listTmuxDispatchItems(missionId);
    markTmuxDispatchItemSubmitted({
      missionId,
      itemId: item.id,
      submittedAt: "2026-05-01T00:00:00.000Z",
      submittedBy: "dispatcher:test",
    });

    const mission = getMission(missionId);
    expect(mission).toBeTruthy();
    if (!mission) {
      throw new Error("Expected mission to exist after dispatch submission.");
    }
    buildMissionResumePayload(mission);

    expect(getMission(missionId)?.messageLog).toContainEqual(
      expect.objectContaining({
        deliveredToSessionId: "session-ignis-message-submitted",
        deliveryStatus: "sent",
      }),
    );
    expect(getMission(missionId)?.activityLog).toContainEqual(
      expect.objectContaining({
        source: expect.objectContaining({
          deliveryStatus: "sent",
          sessionId: "session-ignis-message-submitted",
        }),
      }),
    );
    expect(getMission(missionId)?.conversationLog).toEqual([
      expect.objectContaining({
        transport: expect.objectContaining({
          deliveryStatus: "sent",
          sessionId: "session-ignis-message-submitted",
        }),
      }),
      expect.objectContaining({
        transport: expect.objectContaining({
          deliveryStatus: "sent",
          sessionId: "session-ignis-message-submitted",
        }),
      }),
    ]);
  });

  it("records report-return banter when a worker sends a report back to Noctis", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId } = createExecutionMission(root);
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-report" } });

    await sendWorkerReport({
      missionId,
      fromAgent: "prompto",
      taskId: "task-review",
      next: "COMPLETE",
      message: "Looks good from my side.",
      reportStatus: "completed",
    });

    expect(getMission(missionId)?.conversationLog).toEqual([
      expect.objectContaining({
        kind: "directed",
        fromAgent: "prompto",
        toAgent: "noctis",
        speakerAgent: "prompto",
        cue: "report-completed",
      }),
      expect.objectContaining({
        kind: "directed",
        fromAgent: "prompto",
        toAgent: "noctis",
        speakerAgent: "noctis",
        cue: "report-acknowledged",
      }),
    ]);
  });
});