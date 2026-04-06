import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getProjectRoot } from "@/lib/get-project-root.server";
import { createMission, deleteMission, getMission } from "@/lib/mission-store";
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
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");

  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "projects", "alpha"), { recursive: true });
  mkdirSync(join(root, "external-alpha"), { recursive: true });
  writeFileSync(join(root, "external-alpha", "AGENTS.md"), "# Agents\n", "utf-8");
  writeFileSync(join(root, "config", "settings.yaml"), "language: ja\n", "utf-8");
  writeFileSync(
    join(root, "config", "current_projects.yaml"),
    [
      "project_scopes:",
      "  noctis_team:",
      "    active_project_ids:",
      '      - "alpha"',
      "  lunafreya:",
      "    active_project_ids: []",
      'updated_at: "2026-04-04T00:00:00.000Z"',
      'updated_by: "test"',
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(root, "projects", "alpha", "project.yaml"),
    [
      'id: "alpha"',
      'name: "Alpha Project"',
      'root_path: "../../external-alpha"',
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
    promptAsyncMock.mockResolvedValue({ data: { id: "prompt-continue" } });

    const missionId = `mission-solo-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    const mission = createMission(missionId, "session-noctis-continue", {
      title: "Solo mission",
      objective: "Keep using Noctis directly",
      allowedWorkers: ["ignis", "gladiolus"],
    });
    mission.operationState = createOperationState(
      "noctis-autonomous",
      "autonomous",
      buildBuiltinOperationRef("ja", "noctis-autonomous.yaml"),
    );

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