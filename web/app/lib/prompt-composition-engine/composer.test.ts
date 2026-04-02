import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getProjectRoot } from "@/lib/get-project-root.server";
import { buildOperationDebugBundle } from "@/lib/operation-debug/debug-preview.server";
import { loadOperationByName } from "@/lib/operation-definition/operation-loader";
import { processReport } from "@/lib/operation-runtime/runtime";
import { ensureActiveStepTaskId } from "@/lib/operation-runtime/state";
import { createOperationState } from "@/lib/operation-runtime/state";
import {
  composeGenericSessionPrompt,
  composeUserToNoctisPrompt,
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

function buildSyntheticOperationState(): { state: ReturnType<typeof createOperationState>; taskId: string } {
  const operation = loadOperationByName("openspec-dev", "ja");
  const state = createOperationState(operation.name, operation.initial_step);

  const specPlanningTaskId = ensureActiveStepTaskId(state, "noctis");
  processReport({
    missionId: "debug-mission",
    operationState: state,
    reportBody: "Synthetic report from worker\n\n[step:spec-planning]",
    fromAgent: "noctis",
    taskId: specPlanningTaskId,
    next: "implement",
  });

  const taskId = ensureActiveStepTaskId(state, "gladiolus");
  return { state, taskId };
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
      parts: [{ type: "text", text: "Hello from User" }],
    });

    expect(composed.payloadParts[0]?.text).toContain("<workspace-context");
    expect(composed.payloadParts[0]?.text).toContain(`project_root: ${root}/external-alpha`);
    expect(composed.payloadParts[1]?.text).toBe("Hello from User");
    expect(composed.payloadParts[1]?.text).not.toContain("[OPERATION_");
  });

  it("adds workflow extension for User to Noctis activation", () => {
    const root = createTempRoot();
    seedProjectConfig(root);

    const composed = composeUserToNoctisPrompt({
      context: {
        appRoot: root,
        agent: "noctis",
        sessionId: "session-2",
        missionId: "mission-2",
        allowedWorkers: ["ignis", "gladiolus", "prompto"],
      },
      userMessage: "Open the openspec-dev workflow.",
      missionId: "mission-2",
      sessionId: "session-2",
      isNewMission: true,
      selectedOperation: "openspec-dev",
    });

    expect(composed.workflowExtension).not.toContain('<step format="yaml">');
    expect(composed.workflowExtension).toContain("<step-completion-contract");
    expect(composed.sharedContext).toContain("<workspace-context");
    expect(composed.payloadParts).toHaveLength(1);
    expect(composed.payloadParts[0]?.text).toContain("<operation-prompt");
    expect(composed.payloadParts[0]?.text).toContain("<user-request");
    expect(composed.payloadParts[0]?.text).not.toContain("allowed_workers:");
    expect(composed.payloadParts[0]?.text).toContain(
      `source="${getProjectRoot()}/builtins/ja/facets/jobs/planner.md"`,
    );
    expect(composed.payloadParts[0]?.text).not.toContain(
      `source="${getProjectRoot()}/builtins/ja/facets/output-contracts/spec-plan.md"`,
    );
    expect(composed.payloadParts[0]?.text).not.toContain(
      `source="${getProjectRoot()}/builtins/ja/facets/knowledge/operation-engine-and-builtins-injection.md"`,
    );
    expect(composed.payloadParts[0]?.text).not.toContain('source="../facets/');
    expect(composed.payloadParts[0]?.text).not.toContain("[NOCTIS_ROUTED_MESSAGE]");
  });

  it("builds worker prompts through the workflow extension when operation state is active", () => {
    const root = createTempRoot();
    seedProjectConfig(root);
    const { state: operationState, taskId } = buildSyntheticOperationState();

    const composed = composeWorkerTaskPrompt({
      context: {
        appRoot: root,
        agent: "gladiolus",
        sessionId: "worker-session",
        missionId: "mission-3",
      },
      missionId: "mission-3",
      agentId: "gladiolus",
      taskId,
      originalPrompt: "Task ID: task-1\nTask: implement the change",
      operationStateOverride: operationState,
    });

    expect(composed.usedWorkflowExtension).toBe(true);
    expect(composed.workflowExtension).toContain("<job");
    expect(composed.workflowExtension).not.toContain('<step format="yaml">');
    expect(composed.effectivePrompt).toContain("<task");
    expect(composed.effectivePrompt).toContain("<step-completion-contract");
    expect(composed.effectivePrompt).toContain(
      `scripts/send_report.sh mission-3 gladiolus ${taskId} review "<message>"`,
    );
    expect(composed.effectivePrompt).not.toContain("--rule-index <index>");
    expect(composed.sharedContext).toContain("<workspace-context");
    expect(composed.payloadParts[0]?.text).not.toContain("<delegation-context");
    expect(composed.payloadParts[0]?.text).toContain(
      `source="${getProjectRoot()}/builtins/ja/facets/policies/coding-standards.md"`,
    );
    expect(composed.payloadParts[0]?.text).not.toContain('source="../facets/');
    expect(composed.payloadParts).toHaveLength(1);
  });

  it("keeps debug preview aligned with composed worker prompt structure", () => {
    const root = getProjectRoot();
    const { state: operationState, taskId } = buildSyntheticOperationState();
    const bundle = buildOperationDebugBundle({
      operationName: "openspec-dev",
      taskInstruction: "Synthetic task for gladiolus: implement the current step as Noctis instructed.",
    });
    const workerStep = bundle.flowSteps.find(
      (step) => step.kind === "worker-step" && step.stepName === "implement",
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
      taskId,
      originalPrompt: "Synthetic task for gladiolus: implement the current step as Noctis instructed.",
      operationStateOverride: operationState,
    });

    expect(workerStep).toBeTruthy();
    expect(workerStep?.to).toBe("Gladiolus");
    expect(workerStep?.pathSummary).toBe("Noctis -> Runtime -> Gladiolus");
    expect(workerStep?.inputHighlightText).toBe(
      "Synthetic task for gladiolus: implement the current step as Noctis instructed.",
    );
    expect(workerStep?.effectivePrompt).toBe(composed.effectivePrompt);
    expect(workerStep?.internalContext).toBe(composed.sharedContext);
  });

  it("follows runtime step transitions in the debug flow", () => {
    const bundle = buildOperationDebugBundle({
      operationName: "openspec-dev",
    });

    expect(
      bundle.flowSteps.map(
        (step) =>
          `${step.stepName}:${step.kind}:${step.pathSummary}:${step.decisionSummary}`,
      ),
    ).toEqual([
      "spec-planning:noctis-step:User -> Runtime -> Noctis:dispatch_worker -> Gladiolus (implement)",
      "implement:worker-step:Noctis -> Runtime -> Gladiolus:dispatch_worker -> Ignis (review)",
      "review:worker-step:Gladiolus -> Runtime -> Ignis:dispatch_worker -> Prompto (refactor)",
      "refactor:worker-step:Ignis -> Runtime -> Prompto:report_to_user -> COMPLETE",
    ]);
    expect(bundle.flowSteps.some((step) => step.stepName === "fix")).toBe(false);
  });

  it("keeps debug preview aligned with composed Noctis activation prompt structure", () => {
    const root = getProjectRoot();
    const bundle = buildOperationDebugBundle({
      missionId: "debug-self-step-preview",
      operationName: "openspec-dev",
    });
    const selfStep = bundle.flowSteps.find(
      (step) => step.kind === "noctis-step" && step.to === "Noctis",
    );

    const composed = composeUserToNoctisPrompt({
      context: {
        appRoot: root,
        agent: "noctis",
        sessionId: "debug-noctis-session",
        missionId: "debug-self-step-preview",
        allowedWorkers: ["ignis", "gladiolus", "prompto"],
      },
      userMessage: "This is a synthetic User message for operation activation.",
      missionId: "debug-self-step-preview",
      sessionId: "debug-noctis-session",
      isNewMission: true,
      selectedOperation: "openspec-dev",
    });

    expect(selfStep).toBeTruthy();
    expect(selfStep?.pathSummary).toBe("User -> Runtime -> Noctis");
    expect(selfStep?.effectivePrompt).toBe(composed.effectivePrompt);
    expect(selfStep?.internalContext).toBe(composed.sharedContext);
    expect(selfStep?.sourceInput).toBe(composed.promptBody);
    expect(selfStep?.inputHighlightText).toBe("This is a synthetic User message for operation activation.");
    expect(selfStep?.injectedPrompt).toBe(composed.workflowExtension);
    expect(selfStep?.effectivePrompt).not.toContain("allowed_workers:");
  });
});