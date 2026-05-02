import { execSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getProjectRoot } from "@/lib/get-project-root.server";
import { listPrimaryAgentOutboxItems } from "@/lib/mission-primary-agent-outbox.server";
import { createMission, deleteMission, getMission } from "@/lib/mission-store";
import { writeTmuxActiveMission } from "@/lib/tmux-active-mission.server";

const {
  ownerSessionCreateMock,
  ownerSessionMessagesMock,
  promptAsyncMock,
  sessionCreateMock,
  sessionStatusMock,
} = vi.hoisted(() => ({
  ownerSessionCreateMock: vi.fn(),
  ownerSessionMessagesMock: vi.fn(),
  promptAsyncMock: vi.fn(),
  sessionCreateMock: vi.fn(),
  sessionStatusMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  createProjectOpencodeClient: () => ({
    session: {
      create: ownerSessionCreateMock,
      messages: ownerSessionMessagesMock,
      promptAsync: promptAsyncMock,
      status: sessionStatusMock,
    },
  }),
  getOpencodeClient: () => ({
    session: {
      create: sessionCreateMock,
      messages: ownerSessionMessagesMock,
      promptAsync: promptAsyncMock,
      status: sessionStatusMock,
    },
  }),
}));

import { action as continueAction } from "./api.lunafreya.mission.continue";
import { action as startAction } from "./api.lunafreya.mission.start";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const originalFetch = globalThis.fetch;
const repoRoot = getProjectRoot();

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-lunafreya-mission-"));
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
    ["language: ja", 'execution_workspace_root: ".worktrees"', ""].join("\n"),
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

  mkdirSync(join(root, "builtins", "ja", "facets", "jobs"), { recursive: true });
  writeFileSync(
    join(root, "builtins", "ja", "facets", "jobs", "luna-strategist.md"),
    [
      "---",
      "name: Strategic Advisor",
      "description: Adds structured strategic framing.",
      "---",
      "# Strategic Advisor",
      "",
      "Structure the response as calm, high-signal guidance.",
      "",
    ].join("\n"),
    "utf-8"
  );

  mkdirSync(join(root, "builtins", "ja", "facets", "skills", "oracle-notes"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "builtins", "ja", "facets", "skills", "oracle-notes", "SKILL.md"),
    [
      "---",
      "name: oracle-notes",
      "description: Read when you need Lunafreya-specific long-horizon guidance.",
      "---",
      "# Oracle Notes",
      "",
      "Consider the longer-term implications before committing to a direction.",
      "",
    ].join("\n"),
    "utf-8"
  );

  mkdirSync(join(root, "projects", "alpha", "facets", "skills", "domain-notes"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "projects", "alpha", "facets", "skills", "domain-notes", "SKILL.md"),
    [
      "---",
      "name: alpha-domain-notes",
      "description: Use the Alpha project conventions and existing module boundaries.",
      "---",
      "# Alpha Domain Notes",
      "",
      "Use the Alpha project conventions and existing module boundaries.",
      "",
    ].join("\n"),
    "utf-8"
  );

  mkdirSync(join(root, "skills", "project-manage"), { recursive: true });
  writeFileSync(
    join(root, "skills", "project-manage", "SKILL.md"),
    [
      "---",
      "name: project-manage",
      "description: Manage project execution work.",
      "---",
      "# Project Manage",
      "",
      "Manage project execution work.",
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
            agentId: "lunafreya",
            port: 4402,
            url: "http://127.0.0.1:4402",
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

describe("Lunafreya mission routing", () => {
  it("returns an operation terminology error when the hidden Lunafreya operation is unavailable", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    rmSync(join(root, "builtins", "ja", "operations", "lunafreya-autonomous.yaml"), {
      force: true,
    });
    rmSync(join(root, "builtins", "en", "operations", "lunafreya-autonomous.yaml"), {
      force: true,
    });

    const response = await startAction({
      request: new Request("http://localhost/api/lunafreya/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Guide me calmly.",
          executionProjectId: "alpha",
        }),
      }),
    } as never);

    expect(response.status).toBe(409);
    await expect(readJson<{ error: string }>(response)).resolves.toEqual({
      error: "Hidden Lunafreya operation is not available.",
    });
  });

  it("refuses Lunafreya mission start when tmux transport bootstrap is unhealthy", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
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

    const response = await startAction({
      request: new Request("http://localhost/api/lunafreya/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Guide me through tmux transport.",
          executionProjectId: "alpha",
        }),
      }),
    } as never);

    expect(response.status).toBe(503);
    await expect(readJson<{ error: string }>(response)).resolves.toEqual({
      error: expect.stringContaining("Missing tmux transport endpoint manifest"),
    });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("enqueues tmux-resident Lunafreya mission start payloads instead of dispatching them inline", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
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
    writeHealthyTmuxTransportBootstrapArtifacts(root);
    sessionCreateMock.mockResolvedValue({ data: { id: "session-lunafreya-tmux-start" } });

    const response = await startAction({
      request: new Request("http://localhost/api/lunafreya/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Guide me through tmux transport.",
          executionProjectId: "alpha",
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{ missionId: string; lunafreyaSessionId: string }>(response);
    missionIds.push(data.missionId);

    expect(data.lunafreyaSessionId).toBe("session-lunafreya-tmux-start");
    expect(promptAsyncMock).not.toHaveBeenCalled();

    const queuedItems = listPrimaryAgentOutboxItems(data.missionId);
    expect(queuedItems).toHaveLength(1);
    expect(queuedItems[0]).toMatchObject({
      status: "pending",
      payload: {
        agent: "lunafreya",
        sessionId: "session-lunafreya-tmux-start",
        sessionTitle: `mission:${data.missionId}:lunafreya`,
        parts: [
          {
            type: "text",
            text: expect.stringContaining('<user-request from="user" to="lunafreya">') as never,
          },
        ],
      },
    });
  });

  it("blocks tmux-resident Lunafreya mission start when another writable mission is still busy", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
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
    writeHealthyTmuxTransportBootstrapArtifacts(root);

    const activeMission = createMission(
      `mission-luna-active-${crypto.randomUUID()}`,
      "session-luna-active",
      {
        title: "Active Lunafreya mission",
        objective: "Hold tmux write focus",
        executionProjectId: "alpha",
        primaryAgentId: "lunafreya",
        surfaceId: "lunafreya",
      }
    );
    missionIds.push(activeMission.id);
    writeTmuxActiveMission(root, {
      missionId: activeMission.id,
      updatedAt: "2026-04-30T10:00:00.000Z",
    });
    sessionStatusMock.mockResolvedValue({
      data: {
        "session-luna-active": "busy",
      },
      error: null,
    });

    const response = await startAction({
      request: new Request("http://localhost/api/lunafreya/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executionProjectId: "alpha",
          message: "Do not steal tmux focus from another active Lunafreya mission.",
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

  it("starts a Lunafreya mission with the implicit default Job when no explicit override is selected", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    sessionCreateMock.mockResolvedValue({ data: { id: "session-lunafreya-default" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-lunafreya-default" } });

    const response = await startAction({
      request: new Request("http://localhost/api/lunafreya/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Guide me calmly.",
          executionProjectId: "alpha",
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{ missionId: string; lunafreyaSessionId: string }>(response);
    missionIds.push(data.missionId);

    const mission = getMission(data.missionId);
    expect(mission?.executionTargetMode).toBe("execution_project");
    expect(mission?.workspacePath).toBeUndefined();
    expect(mission?.workspaceStatus).toBeUndefined();
    expect(mission?.lunafreyaFacetSelection).toMatchObject({
      selectedSkillIds: [],
    });
    expect(mission?.lunafreyaFacetSelection?.selectedJobId).toBeUndefined();
    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${data.missionId}:lunafreya`,
      })
    );

    const promptText = promptAsyncMock.mock.calls[0]?.[0]?.parts?.[0]?.text as string;
    expect(promptText.match(/<job>/g) ?? []).toHaveLength(1);
    expect(promptText).toContain("Lunafreya Autonomous");
    expect(promptText).not.toContain("<instruction>");
    expect(promptText).not.toContain("Hidden Lunafreya Instruction");
    expect(promptText).not.toContain("<lunafreya-overlays>");
  });

  it("starts a Lunafreya mission with the hidden workflow and selected overlays", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    sessionCreateMock.mockResolvedValue({ data: { id: "session-lunafreya-start" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-lunafreya-start" } });

    const response = await startAction({
      request: new Request("http://localhost/api/lunafreya/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Guide me through the next decision.",
          executionProjectId: "alpha",
          selectedJobId: "builtin:ja:jobs/luna-strategist.md",
          selectedSkillIds: ["project:alpha:skills/domain-notes"],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{ missionId: string; lunafreyaSessionId: string }>(response);
    missionIds.push(data.missionId);

    const mission = getMission(data.missionId);
    expect(mission?.surfaceId).toBe("lunafreya");
    expect(mission?.primaryAgentId).toBe("lunafreya");
    expect(mission?.primarySessionId).toBe("session-lunafreya-start");
    expect(mission?.noctisSessionId).toBe("");
    expect(mission?.lunafreyaFacetSelection).toMatchObject({
      selectedJobId: "builtin:ja:jobs/luna-strategist.md",
      selectedSkillIds: ["project:alpha:skills/domain-notes"],
    });

    expect(promptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "lunafreya",
      })
    );

    const promptText = promptAsyncMock.mock.calls[0]?.[0]?.parts?.[0]?.text as string;
    expect(promptText.match(/<job>/g) ?? []).toHaveLength(1);
    expect(promptText).toContain("Strategic Advisor");
    expect(promptText).toContain("alpha-domain-notes");
    expect(promptText).toContain("<reference-files>");
    expect(promptText).toContain("<reference-file>");
    expect(promptText).toContain("<description>");
    expect(promptText).not.toContain("<instruction>");
    expect(promptText).not.toContain("Hidden Lunafreya Instruction");
    expect(promptText).not.toContain("<lunafreya-skill-overlay>");
    expect(promptText).not.toContain("<delegation-context");
  });

  it("merges selected Lunafreya skills and shared selected skills into one prompt reference-files section", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    writeFileSync(
      join(root, "config", "shared-skills.yaml"),
      ["selected_skill_ids:", '  - "project-manage"', ""].join("\n"),
      "utf-8"
    );
    sessionCreateMock.mockResolvedValue({ data: { id: "session-lunafreya-shared" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-lunafreya-shared" } });

    const response = await startAction({
      request: new Request("http://localhost/api/lunafreya/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Guide me through the next decision.",
          executionProjectId: "alpha",
          selectedSkillIds: ["project:alpha:skills/domain-notes"],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    const data = await readJson<{ missionId: string }>(response);
    missionIds.push(data.missionId);

    const promptText = promptAsyncMock.mock.calls[0]?.[0]?.parts?.[0]?.text as string;
    expect(promptText).toContain("<reference-files>");
    expect(promptText.match(/<reference-files>/g)).toHaveLength(1);
    expect(promptText).toContain("alpha-domain-notes");
    expect(promptText).toContain("project-manage");
  });

  it("keeps the Lunafreya session alive and applies updated overlays on continue", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRoot();
    sessionCreateMock.mockResolvedValueOnce({ data: { id: "session-lunafreya-start" } });
    promptAsyncMock.mockResolvedValueOnce({ data: { id: "prompt-lunafreya-start" } });

    const startResponse = await startAction({
      request: new Request("http://localhost/api/lunafreya/mission/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Begin a Lunafreya mission.",
          executionProjectId: "alpha",
          selectedJobId: "builtin:ja:jobs/luna-strategist.md",
          selectedSkillIds: ["project:alpha:skills/domain-notes"],
        }),
      }),
    } as never);

    expect(startResponse.status).toBe(200);
    const { missionId } = await readJson<{ missionId: string }>(startResponse);
    missionIds.push(missionId);

    sessionCreateMock.mockClear();
    promptAsyncMock.mockClear();
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-lunafreya-continue" } });

    const response = await continueAction({
      request: new Request("http://localhost/api/lunafreya/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId,
          message: "Now weigh the long-term risks too.",
          selectedSkillIds: ["builtin:ja:skills/oracle-notes", "project:alpha:skills/domain-notes"],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    await readJson<{ lunafreyaSessionId: string }>(response);

    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(promptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "lunafreya",
      })
    );

    const mission = getMission(missionId);
    expect(mission?.lunafreyaFacetSelection).toMatchObject({
      selectedJobId: "builtin:ja:jobs/luna-strategist.md",
      selectedSkillIds: ["builtin:ja:skills/oracle-notes", "project:alpha:skills/domain-notes"],
    });

    const promptText = promptAsyncMock.mock.calls[0]?.[0]?.parts?.[0]?.text as string;
    expect(promptText.match(/<job>/g) ?? []).toHaveLength(1);
    expect(promptText).toContain("oracle-notes");
    expect(promptText).toContain("alpha-domain-notes");
    expect(promptText).toContain("Strategic Advisor");
    expect(promptText).toContain("<reference-files>");
    expect(promptText).toContain("<reference-file>");
    expect(promptText).toContain("<name>");
    expect(promptText).not.toContain("<instruction>");
    expect(promptText).not.toContain("Hidden Lunafreya Instruction");
    expect(promptText).not.toContain("<lunafreya-skill-overlay>");
  });

  it("enqueues tmux-resident Lunafreya mission continue payloads instead of dispatching them inline", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
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
    writeHealthyTmuxTransportBootstrapArtifacts(root);

    const mission = createMission(
      `mission-luna-tmux-${crypto.randomUUID()}`,
      "session-lunafreya-existing",
      {
        title: "Lunafreya tmux mission",
        objective: "Resume through tmux outbox",
        surfaceId: "lunafreya",
        primaryAgentId: "lunafreya",
        executionProjectId: "alpha",
        executionTargetMode: "execution_project",
      }
    );
    missionIds.push(mission.id);
    globalThis.fetch = vi.fn(async (input) => {
      expect(String(input)).toBe("http://127.0.0.1:4402/session/session-lunafreya-existing");
      return new Response(JSON.stringify({ id: "session-lunafreya-existing" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const response = await continueAction({
      request: new Request("http://localhost/api/lunafreya/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          message: "Guide me through tmux resume.",
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    await expect(readJson<{ lunafreyaSessionId: string }>(response)).resolves.toEqual({
      lunafreyaSessionId: "session-lunafreya-existing",
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(ownerSessionMessagesMock).not.toHaveBeenCalled();
    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(promptAsyncMock).not.toHaveBeenCalled();

    const queuedItems = listPrimaryAgentOutboxItems(mission.id);
    expect(queuedItems).toHaveLength(1);
    expect(queuedItems[0]).toMatchObject({
      status: "pending",
      payload: {
        agent: "lunafreya",
        sessionId: "session-lunafreya-existing",
        sessionTitle: `mission:${mission.id}:lunafreya`,
      },
    });
  });

  it("recreates an unreadable tmux-resident Lunafreya session on continue", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
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
    writeHealthyTmuxTransportBootstrapArtifacts(root);

    const mission = createMission(
      `mission-luna-tmux-recreate-${crypto.randomUUID()}`,
      "session-lunafreya-stale",
      {
        title: "Lunafreya tmux stale mission",
        objective: "Resume with a recreated owner session",
        surfaceId: "lunafreya",
        primaryAgentId: "lunafreya",
        executionProjectId: "alpha",
        executionTargetMode: "execution_project",
      }
    );
    missionIds.push(mission.id);
    globalThis.fetch = vi.fn(async (input) => {
      expect(String(input)).toBe("http://127.0.0.1:4402/session/session-lunafreya-stale");
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    ownerSessionCreateMock.mockResolvedValueOnce({ data: { id: "session-lunafreya-recreated" } });

    const response = await continueAction({
      request: new Request("http://localhost/api/lunafreya/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          message: "Resume with a recreated owner session.",
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    await expect(readJson<{ lunafreyaSessionId: string }>(response)).resolves.toEqual({
      lunafreyaSessionId: "session-lunafreya-recreated",
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(ownerSessionMessagesMock).not.toHaveBeenCalled();
    expect(ownerSessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${mission.id}:lunafreya`,
      })
    );
    expect(getMission(mission.id)?.primarySessionId).toBe("session-lunafreya-recreated");
  });

  it("blocks tmux-resident Lunafreya mission continue when another writable mission is still busy", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
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
    writeHealthyTmuxTransportBootstrapArtifacts(root);

    const activeMission = createMission(
      `mission-luna-active-${crypto.randomUUID()}`,
      "session-luna-active",
      {
        title: "Active Lunafreya mission",
        objective: "Hold tmux write focus",
        executionProjectId: "alpha",
        primaryAgentId: "lunafreya",
        surfaceId: "lunafreya",
      }
    );
    const targetMission = createMission(
      `mission-luna-target-${crypto.randomUUID()}`,
      "session-luna-target",
      {
        title: "Target Lunafreya mission",
        objective: "Attempt to resume while another mission is busy",
        executionProjectId: "alpha",
        primaryAgentId: "lunafreya",
        surfaceId: "lunafreya",
      }
    );
    missionIds.push(activeMission.id, targetMission.id);
    writeTmuxActiveMission(root, {
      missionId: activeMission.id,
      updatedAt: "2026-04-30T10:00:00.000Z",
    });
    sessionStatusMock.mockResolvedValue({
      data: {
        "session-luna-active": "busy",
        "session-luna-target": "idle",
      },
      error: null,
    });

    const response = await continueAction({
      request: new Request("http://localhost/api/lunafreya/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: targetMission.id,
          message: "Do not steal tmux focus from the active mission.",
        }),
      }),
    } as never);

    expect(response.status).toBe(409);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: expect.stringContaining(activeMission.id),
    });
    expect(promptAsyncMock).not.toHaveBeenCalled();
  });

  it("recreates a missing Lunafreya session from the app root on continue", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const mission = createMission(`mission-${crypto.randomUUID()}`, "", {
      title: "Lunafreya direct mission",
      objective: "Resume with a recreated primary session",
      surfaceId: "lunafreya",
      primaryAgentId: "lunafreya",
      executionProjectId: "alpha",
      executionTargetMode: "execution_project",
    });
    missionIds.push(mission.id);
    sessionCreateMock.mockResolvedValue({ data: { id: "session-lunafreya-recreated" } });
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-lunafreya-recreated" } });

    const response = await continueAction({
      request: new Request("http://localhost/api/lunafreya/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          message: "Resume with a recreated primary session.",
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    await expect(readJson<{ lunafreyaSessionId: string }>(response)).resolves.toEqual({
      lunafreyaSessionId: "session-lunafreya-recreated",
    });
    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: root,
        title: `mission:${mission.id}:lunafreya`,
      })
    );
    expect(getMission(mission.id)?.primarySessionId).toBe("session-lunafreya-recreated");
  });

  it("continues to require tmux readiness for Lunafreya based on the mission transport snapshot", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
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

    const mission = createMission(`mission-luna-tmux-${crypto.randomUUID()}`, "session-luna-tmux", {
      title: "Lunafreya tmux snapshot mission",
      objective: "Keep using the stored tmux transport mode",
      surfaceId: "lunafreya",
      primaryAgentId: "lunafreya",
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
      request: new Request("http://localhost/api/lunafreya/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId: mission.id,
          message: "Resume through the stored tmux transport mode.",
        }),
      }),
    } as never);

    expect(response.status).toBe(503);
    await expect(readJson<{ error: string }>(response)).resolves.toEqual({
      error: expect.stringContaining("Missing tmux transport endpoint manifest"),
    });
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("blocks continue for Lunafreya missions with an unsupported runtime format", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    const missionId = `mission-luna-unsupported-${crypto.randomUUID()}`;
    missionIds.push(missionId);

    mkdirSync(join(root, "runtime", "noctis-missions", missionId), { recursive: true });
    writeFileSync(
      join(root, "runtime", "noctis-missions", missionId, "mission.json"),
      `${JSON.stringify(
        {
          id: missionId,
          noctisSessionId: "",
          primaryAgentId: "lunafreya",
          primarySessionId: "session-luna-legacy",
          surfaceId: "lunafreya",
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
          title: "Unsupported Lunafreya mission",
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
      request: new Request("http://localhost/api/lunafreya/mission/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          missionId,
          message: "Attempt to resume an unsupported Lunafreya mission.",
        }),
      }),
    } as never);

    expect(response.status).toBe(409);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: "Mission uses an unsupported runtime format and can no longer be resumed.",
    });
  });
});
