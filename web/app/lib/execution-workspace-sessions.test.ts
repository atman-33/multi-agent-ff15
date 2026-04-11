import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getProjectRoot } from "@/lib/get-project-root.server";
import { provisionMissionExecutionWorkspace } from "@/lib/mission-execution-workspace.server";
import {
  createMission,
  deleteMission,
  getMission,
  setWorkerSession,
} from "@/lib/mission-store";
import { dispatchTaskToWorker } from "@/lib/task-dispatch.server";
import { sendSimpleMessage, sendWorkerReport } from "@/lib/team-message.server";

const { promptAsyncMock, sessionCreateMock } = vi.hoisted(() => ({
  promptAsyncMock: vi.fn(),
  sessionCreateMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      create: sessionCreateMock,
      promptAsync: promptAsyncMock,
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

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-execution-sessions-"));
  tempRoots.push(root);
  cpSync(join(repoRoot, "builtins"), join(root, "builtins"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");

  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "projects", "alpha"), { recursive: true });
  mkdirSync(join(root, "external-alpha"), { recursive: true });
  initializeGitProject(join(root, "external-alpha"));

  writeFileSync(
    join(root, "config", "settings.yaml"),
    ['language: ja', 'execution_workspace_root: ".worktrees"', ''].join("\n"),
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
    const { missionId, workspacePath } = createExecutionMission(root);
    sessionCreateMock.mockResolvedValue({ data: { id: "session-ignis" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-worker" } });

    await dispatchTaskToWorker({
      missionId,
      agentId: "ignis",
      message: "Handle the task in the execution workspace.",
    });

    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: workspacePath,
        title: `mission:${missionId}:ignis`,
      }),
    );
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
        directory: join(root, "external-alpha"),
        title: `mission:${missionId}:ignis`,
      }),
    );
  });

  it("uses the mission execution workspace for team-message worker sessions", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const { missionId, workspacePath } = createExecutionMission(root);
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
        directory: workspacePath,
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
        directory: join(root, "external-alpha"),
        title: `mission:${missionId}:ignis`,
      }),
    );
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