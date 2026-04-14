import { execSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getProjectRoot } from "@/lib/get-project-root.server";
import { deleteMission, getMission } from "@/lib/mission-store";

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

import { action as continueAction } from "./api.lunafreya.mission.continue";
import { action as startAction } from "./api.lunafreya.mission.start";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
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
      'instruction_files:',
      '  - path: "../../external-alpha/AGENTS.md"',
      '    enabled: true',
      '',
    ].join("\n"),
    "utf-8",
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
    "utf-8",
  );

  mkdirSync(join(root, "builtins", "ja", "facets", "skills", "oracle-notes"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "builtins", "ja", "facets", "skills", "oracle-notes", "SKILL.md"),
    [
      "---",
      "name: oracle-notes",
      'description: Read when you need Lunafreya-specific long-horizon guidance.',
      "---",
      "# Oracle Notes",
      "",
      "Consider the longer-term implications before committing to a direction.",
      "",
    ].join("\n"),
    "utf-8",
  );

  mkdirSync(join(root, "projects", "alpha", "facets", "skills", "domain-notes"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "projects", "alpha", "facets", "skills", "domain-notes", "SKILL.md"),
    [
      "---",
      "name: alpha-domain-notes",
      'description: Use the Alpha project conventions and existing module boundaries.',
      "---",
      "# Alpha Domain Notes",
      "",
      "Use the Alpha project conventions and existing module boundaries.",
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

describe("Lunafreya mission routing", () => {
  it("returns an operation terminology error when the hidden Lunafreya operation is unavailable", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    rmSync(join(root, "builtins", "ja", "operations", "lunafreya-autonomous.yaml"), { force: true });
    rmSync(join(root, "builtins", "en", "operations", "lunafreya-autonomous.yaml"), { force: true });

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
        directory: join(root, "external-alpha"),
        title: `mission:${data.missionId}`,
      }),
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
      }),
    );

    const promptText = promptAsyncMock.mock.calls[0]?.[0]?.parts?.[0]?.text as string;
    expect(promptText.match(/<job>/g) ?? []).toHaveLength(1);
    expect(promptText).toContain("Strategic Advisor");
    expect(promptText).toContain("alpha-domain-notes");
    expect(promptText).toContain("<skills>");
    expect(promptText).toContain("<skill>");
    expect(promptText).toContain("<description>");
    expect(promptText).not.toContain("<instruction>");
    expect(promptText).not.toContain("Hidden Lunafreya Instruction");
    expect(promptText).not.toContain("<lunafreya-skill-overlay>");
    expect(promptText).not.toContain("<delegation-context");
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
          selectedSkillIds: [
            "builtin:ja:skills/oracle-notes",
            "project:alpha:skills/domain-notes",
          ],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    await readJson<{ lunafreyaSessionId: string }>(response);

    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(promptAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "lunafreya",
      }),
    );

    const mission = getMission(missionId);
    expect(mission?.lunafreyaFacetSelection).toMatchObject({
      selectedJobId: "builtin:ja:jobs/luna-strategist.md",
      selectedSkillIds: [
        "builtin:ja:skills/oracle-notes",
        "project:alpha:skills/domain-notes",
      ],
    });

    const promptText = promptAsyncMock.mock.calls[0]?.[0]?.parts?.[0]?.text as string;
    expect(promptText.match(/<job>/g) ?? []).toHaveLength(1);
    expect(promptText).toContain("oracle-notes");
    expect(promptText).toContain("alpha-domain-notes");
    expect(promptText).toContain("Strategic Advisor");
    expect(promptText).toContain("<skills>");
    expect(promptText).toContain("<skill>");
    expect(promptText).toContain("<name>");
    expect(promptText).not.toContain("<instruction>");
    expect(promptText).not.toContain("Hidden Lunafreya Instruction");
    expect(promptText).not.toContain("<lunafreya-skill-overlay>");
  });
});