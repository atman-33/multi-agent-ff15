import { execSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getProjectRoot } from "@/lib/get-project-root.server";
import { deleteMission, getMission } from "@/lib/mission-store";
import { buildBuiltinOperationRef } from "@/lib/operation-definition/operation-catalog";
import { createOperationState } from "@/lib/operation-runtime/state";

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

import { action as continueAction } from "./api.noctis.mission.continue";
import { action as startAction } from "./api.noctis.mission.start";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const repoRoot = getProjectRoot();

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-noctis-mission-"));
  tempRoots.push(root);
  cpSync(join(repoRoot, "builtins"), join(root, "builtins"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");

  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "projects", "alpha"), { recursive: true });
  mkdirSync(join(root, "external-alpha"), { recursive: true });
  writeFileSync(join(root, "external-alpha", "AGENTS.md"), "# Agents\n", "utf-8");
  writeFileSync(join(root, "external-alpha", "README.md"), "# Alpha\n", "utf-8");
  execSync("git init -b main", { cwd: join(root, "external-alpha"), stdio: "ignore" });
  execSync('git config user.email "test@example.com"', {
    cwd: join(root, "external-alpha"),
    stdio: "ignore",
  });
  execSync('git config user.name "Test User"', {
    cwd: join(root, "external-alpha"),
    stdio: "ignore",
  });
  execSync("git add README.md AGENTS.md", { cwd: join(root, "external-alpha"), stdio: "ignore" });
  execSync('git commit -m "init"', { cwd: join(root, "external-alpha"), stdio: "ignore" });
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

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
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

describe("Noctis mission solo routing", () => {
  it("keeps mission start on the base noctis profile in solo mode", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    sessionCreateMock.mockResolvedValue({ data: { id: "session-noctis-start" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-start" } });

    const response = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Handle this directly.",
          executionProjectId: "alpha",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{ missionId: string }>(response);
    missionIds.push(data.missionId);

    expect(getMission(data.missionId)?.allowedWorkers).toEqual([]);
    expect(promptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "noctis",
      }),
    );

    const promptText = promptAsyncMock.mock.calls[0]?.[0]?.parts?.[0]?.text as string;
    expect(promptText).not.toContain("<delegation-context");
    expect(promptText).toContain("Effective allowed workers: none");
    expect(promptText).not.toContain("noctis-solo");
  });

  it("keeps mission continue on the base noctis profile in solo mode", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    sessionCreateMock.mockResolvedValueOnce({ data: { id: "session-noctis-start" } });
    promptAsyncMock.mockResolvedValueOnce({ data: { id: "prompt-start" } });

    const startResponse = await startAction({
      request: new Request("http://localhost/api/noctis/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Create a solo mission first.",
          executionProjectId: "alpha",
          allowedWorkers: ["ignis", "gladiolus"],
        }),
      }),
    } as never);

    expect(startResponse.status).toBe(200);
    const { missionId } = await readJson<{ missionId: string }>(startResponse);
    missionIds.push(missionId);

    const mission = getMission(missionId);
    expect(mission).toBeDefined();
    if (!mission) {
      throw new Error("Mission should exist after start");
    }
    mission.operationState = createOperationState(
      "noctis-autonomous",
      "autonomous",
      buildBuiltinOperationRef("ja", "noctis-autonomous.yaml"),
    );

    sessionCreateMock.mockClear();
    promptAsyncMock.mockClear();
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-continue" } });

    const response = await continueAction({
      request: new Request("http://localhost/api/noctis/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId,
          message: "Stay on the same solo step.",
          allowedWorkers: [],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    await readJson<{ noctisSessionId: string }>(response);

    expect(getMission(missionId)?.allowedWorkers).toEqual([]);
    expect(promptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "noctis",
      }),
    );

    const promptText = promptAsyncMock.mock.calls[0]?.[0]?.parts?.[0]?.text as string;
    expect(promptText).not.toContain("<delegation-context");
    expect(promptText).toContain("Effective allowed workers: none");
    expect(promptText).not.toContain("noctis-solo");
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });
});