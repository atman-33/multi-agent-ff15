import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getProjectRoot } from "@/lib/get-project-root.server";
import { buildOperationDebugBundle } from "@/lib/operation-debug/debug-preview.server";
import { loadOperationByName } from "@/lib/operation-definition/operation-loader";
import { createOperationState } from "@/lib/operation-runtime/state";
import {
  composeCrystalToNoctisPrompt,
  composeGenericSessionPrompt,
  composeWorkerTaskPrompt,
} from "./index";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-prompt-composer-"));
  tempRoots.push(root);
  return root;
}

function seedProjectConfig(root: string) {
  const projectRoot = join(root, "external-alpha");

  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "projects", "alpha"), { recursive: true });
  mkdirSync(projectRoot, { recursive: true });

  writeFileSync(join(projectRoot, "AGENTS.md"), "# Agents\n", "utf-8");
  writeFileSync(
    join(root, "config", "current_projects.yaml"),
    [
      "project_scopes:",
      "  noctis_team:",
      "    active_project_ids:",
      '      - "alpha"',
      "  lunafreya:",
      "    active_project_ids: []",
      'updated_at: "2026-03-25T00:00:00.000Z"',
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
}

function buildSyntheticOperationState() {
  const operation = loadOperationByName("openspec-dev", "ja");
  const movementIndex = operation.movements.findIndex((movement) => movement.name === "implement");
  const state = createOperationState(
    operation.name,
    operation.initial_movement,
    operation.max_movements,
  );
  state.currentMovement = "implement";
  state.status = "running";
  state.iteration = movementIndex;
  state.previousResponse = "Synthetic previous movement output";
  state.movementHistory = operation.movements.slice(0, movementIndex).map((movement, index) => ({
    movement: movement.name,
    agent: movement.agent,
    status: "completed" as const,
    dispatchedAt: "2026-03-31T00:00:00.000Z",
    completedAt: "2026-03-31T00:00:00.000Z",
    ruleMatched: 0,
    ruleCondition: movement.rules[0]?.condition ?? "completed",
    nextMovement: operation.movements[index + 1]?.name ?? "COMPLETE",
    summary: `Synthetic summary for ${movement.name}`,
  }));
  return state;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("prompt composition engine", () => {
  it("builds generic session prompts with shared context only", () => {
    const root = createTempRoot();
    seedProjectConfig(root);

    const composed = composeGenericSessionPrompt({
      context: {
        appRoot: root,
        agent: "noctis",
        sessionId: "session-1",
      },
      parts: [{ type: "text", text: "Hello from Crystal" }],
    });

    expect(composed.payloadParts[0]?.text).toContain("<internal-context>");
    expect(composed.payloadParts[0]?.text).toContain("project_scope: noctis_team");
    expect(composed.payloadParts[1]?.text).toBe("Hello from Crystal");
    expect(composed.payloadParts[1]?.text).not.toContain("[OPERATION_");
  });

  it("adds workflow extension for Crystal to Noctis activation", () => {
    const root = createTempRoot();
    seedProjectConfig(root);

    const composed = composeCrystalToNoctisPrompt({
      context: {
        appRoot: root,
        agent: "noctis",
        sessionId: "session-2",
        missionId: "mission-2",
        allowedWorkers: ["ignis", "gladiolus", "prompto"],
      },
      crystalMessage: "Open the openspec-dev workflow.",
      missionId: "mission-2",
      sessionId: "session-2",
      isNewMission: true,
      selectedOperation: "openspec-dev",
    });

    expect(composed.workflowExtension).toContain("[OPERATION_ACTIVATED]");
    expect(composed.payloadParts[0]?.text).toContain("<internal-context>");
    expect(composed.payloadParts[1]?.text).toContain("[OPERATION_ACTIVATED]");
    expect(composed.payloadParts[1]?.text).toContain("[NOCTIS_ROUTED_MESSAGE]");
  });

  it("builds worker prompts through the workflow extension when operation state is active", () => {
    const root = createTempRoot();
    seedProjectConfig(root);
    const operationState = buildSyntheticOperationState();

    const composed = composeWorkerTaskPrompt({
      context: {
        appRoot: root,
        agent: "gladiolus",
        sessionId: "worker-session",
        missionId: "mission-3",
      },
      missionId: "mission-3",
      agentId: "gladiolus",
      originalPrompt: "Task ID: task-1\nTask: implement the change",
      operationStateOverride: operationState,
    });

    expect(composed.usedWorkflowExtension).toBe(true);
    expect(composed.workflowExtension).toContain("## Job");
    expect(composed.effectivePrompt).toContain("## Task");
    expect(composed.payloadParts[0]?.text).toContain("<internal-context>");
  });

  it("keeps debug preview aligned with composed worker prompt structure", () => {
    const root = getProjectRoot();
    const operationState = buildSyntheticOperationState();
    const bundle = buildOperationDebugBundle({
      operationName: "openspec-dev",
      taskInstruction: "Synthetic task for gladiolus: implement the current movement as Noctis instructed.",
    });
    const dispatchStep = bundle.flowSteps.find(
      (step) => step.kind === "dispatch" && step.to === "gladiolus",
    );

    const composed = composeWorkerTaskPrompt({
      context: {
        appRoot: root,
        agent: "gladiolus",
        sessionId: "debug-gladiolus-session",
        missionId: "debug-mission",
      },
      missionId: "debug-mission",
      agentId: "gladiolus",
      originalPrompt: "Synthetic task for gladiolus: implement the current movement as Noctis instructed.",
      operationStateOverride: operationState,
    });

    expect(dispatchStep).toBeTruthy();
    expect(dispatchStep?.effectivePrompt).toBe(composed.effectivePrompt);
    expect(dispatchStep?.internalContext).toBe(composed.sharedContext);
  });
});