import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getProjectRoot } from "@/lib/get-project-root.server";
import { getMissionOutputFilePath } from "@/lib/mission-store";
import { buildOperationDebugBundle } from "@/lib/operation-debug/debug-preview.server";
import { loadOperationByName } from "@/lib/operation-definition/operation-loader";
import { processReport } from "@/lib/operation-runtime/runtime";
import { ensureActiveStepTaskId } from "@/lib/operation-runtime/state";
import { createOperationState } from "@/lib/operation-runtime/state";
import { registerDelegatedTask } from "@/lib/operation-runtime/state";
import {
  composeGenericSessionPrompt,
  composeUserToNoctisPrompt,
  composeWorkerTaskPrompt,
} from "./index";

const tempRoots: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const repoRoot = getProjectRoot();

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-prompt-composer-"));
  tempRoots.push(root);
  cpSync(join(repoRoot, "scripts"), join(root, "scripts"), { recursive: true });
  cpSync(join(repoRoot, "config"), join(root, "config"), { recursive: true });
  cpSync(join(repoRoot, "builtins"), join(root, "builtins"), { recursive: true });
  cpSync(join(repoRoot, "opencode.json"), join(root, "opencode.json"));
  process.env.MULTI_AGENT_FF15_ROOT = root;
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

function writeMalformedOutputContractOperation(root: string) {
  const operationPath = join(root, "builtins", "ja", "operations", "malformed-output-contract.yaml");
  mkdirSync(join(root, "builtins", "ja", "operations"), { recursive: true });
  writeFileSync(
    operationPath,
    [
      "name: malformed-output-contract",
      "description: Malformed output contract fixture",
      "initial_step: spec-planning",
      "steps:",
      "  - name: spec-planning",
      "    agent: noctis",
      "    job:",
      "      inline: Planner role",
      "    instruction:",
      "      inline: Produce the required output.",
      "    output_contracts:",
      "      report:",
      "        - name: spec-plan.md",
      "          format:",
      `            inline: ${JSON.stringify("# Broken output contract")}`,
      "    rules:",
      "      - condition: Ready",
      "        next: implement",
      "  - name: implement",
      "    agent: gladiolus",
      "    instruction:",
      "      inline: Implement the approved plan.",
      "    rules:",
      "      - condition: Done",
      "        next: COMPLETE",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function writeKnowledgeCatalogOperation(root: string) {
  const knowledgeDir = join(root, "builtins", "ja", "facets", "knowledge");
  mkdirSync(knowledgeDir, { recursive: true });
  writeFileSync(
    join(knowledgeDir, "operation-system-contract.md"),
    [
      "---",
      "name: operation-system-contract",
      'description: Read when changing runtime-owned dispatch or report routing.',
      "critical:",
      "  - Runtime decides the next actor.",
      "  - Reports use taskId + next + message.",
      "---",
      "# Full contract body",
      "",
      "This text should not be injected into the prompt.",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(knowledgeDir, "agent-relationships.md"),
    [
      "---",
      "name: agent-relationships",
      'description: Read when you need a compact FF15 relationship cue.',
      "---",
      "# Agent relationships",
      "",
      "This text should also stay out of the prompt body.",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(knowledgeDir, "broken-reference.md"),
    [
      "---",
      "name: broken-reference",
      "---",
      "# Broken reference body",
      "",
      "Fallback to body-backed knowledge.",
      "",
    ].join("\n"),
    "utf-8",
  );

  const operationPath = join(root, "builtins", "ja", "operations", "knowledge-catalog-workflow.yaml");
  mkdirSync(join(root, "builtins", "ja", "operations"), { recursive: true });
  writeFileSync(
    operationPath,
    [
      "name: knowledge-catalog-workflow",
      "description: Knowledge catalog workflow fixture",
      "initial_step: spec-planning",
      "steps:",
      "  - name: spec-planning",
      "    agent: noctis",
      "    job:",
      "      inline: Planner role",
      "    instruction:",
      "      inline: Clarify the request",
      "    knowledge:",
      "      - file: ../facets/knowledge/operation-system-contract.md",
      "      - file: ../facets/knowledge/agent-relationships.md",
      "      - file: ../facets/knowledge/broken-reference.md",
      "      - inline: Prefer runtime-owned dispatch.",
      "    rules:",
      "      - condition: Ready",
      "        next: implement",
      "  - name: implement",
      "    agent: gladiolus",
      "    instruction:",
      "      inline: Implement the approved plan.",
      "    rules:",
      "      - condition: Done",
      "        next: COMPLETE",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function writeNoctisReentryOperation(root: string) {
  const operationPath = join(root, "builtins", "ja", "operations", "noctis-reentry-debug.yaml");
  mkdirSync(join(root, "builtins", "ja", "operations"), { recursive: true });
  writeFileSync(
    operationPath,
    [
      "name: noctis-reentry-debug",
      "description: Noctis reentry fixture for prompt highlight tests",
      "initial_step: spec-planning",
      "steps:",
      "  - name: spec-planning",
      "    agent: noctis",
      "    instruction:",
      "      inline: Plan the request.",
      "    rules:",
      "      - condition: Ready",
      "        next: implement",
      "  - name: implement",
      "    agent: gladiolus",
      "    instruction:",
      "      inline: Implement the plan.",
      "    rules:",
      "      - condition: Need Noctis summary",
      "        next: summarize",
      "  - name: summarize",
      "    agent: noctis",
      "    instruction:",
      "      inline: Summarize the outcome for User.",
      "    rules:",
      "      - condition: Summary complete",
      "        next: COMPLETE",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function writeRequiredOutput(input: {
  missionId: string;
  stepName: string;
  taskId: string;
  filename: string;
  content: string;
}) {
  const outputPath = getMissionOutputFilePath(
    input.missionId,
    input.stepName,
    input.taskId,
    input.filename,
  );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, input.content, "utf-8");
  return outputPath;
}

function buildSyntheticOperationState(missionId: string): {
  state: ReturnType<typeof createOperationState>;
  taskId: string;
  specPlanningTaskId: string;
} {
  const operation = loadOperationByName("openspec-dev", "ja");
  const state = createOperationState(operation.name, operation.initial_step);

  const specPlanningTaskId = ensureActiveStepTaskId(state, "noctis");
  writeRequiredOutput({
    missionId,
    stepName: "spec-planning",
    taskId: specPlanningTaskId,
    filename: "spec-plan.md",
    content: [
      "---",
      "change_name: synthetic-spec-plan",
      "change_path: openspec/changes/synthetic-spec-plan",
      "proposal_path: openspec/changes/synthetic-spec-plan/proposal.md",
      "design_path: openspec/changes/synthetic-spec-plan/design.md",
      "tasks_path: openspec/changes/synthetic-spec-plan/tasks.md",
      "---",
      "",
      "# Spec Plan",
      "",
      "Synthetic spec planning output for composer tests.",
      "",
    ].join("\n"),
  });
  processReport({
    missionId,
    operationState: state,
    reportBody: "Synthetic report from worker",
    fromAgent: "noctis",
    taskId: specPlanningTaskId,
    next: "implement",
  });

  const taskId = ensureActiveStepTaskId(state, "gladiolus");
  return { state, taskId, specPlanningTaskId };
}

function buildSyntheticAutonomousOperationState() {
  const operation = loadOperationByName("noctis-autonomous", "ja");
  const state = createOperationState(operation.name, operation.initial_step);
  const parentTaskId = ensureActiveStepTaskId(state, "noctis");
  const childTaskId = "task-autonomous-child";
  registerDelegatedTask(state, {
    parentStep: "autonomous",
    taskId: childTaskId,
    agent: "ignis",
    message: "Investigate the current issue and report back to Noctis.",
  });

  return { state, parentTaskId, childTaskId };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
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
    const expectedSpecPlanPath = getMissionOutputFilePath(
      "mission-2",
      "spec-planning",
      "step_spec-planning_1",
      "spec-plan.md",
    );

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

    expect(composed.workflowExtension).not.toContain("format=");
    expect(composed.workflowExtension).toContain("<step-completion-contract");
    expect(composed.sharedContext).toContain("<workspace-context");
    expect(composed.payloadParts).toHaveLength(1);
    expect(composed.payloadParts[0]?.text).toContain("<operation-prompt>");
    expect(composed.payloadParts[0]?.text).toContain("<user-request");
    expect(composed.payloadParts[0]?.text).not.toContain("schema=");
    expect(composed.payloadParts[0]?.text).not.toContain("source=");
    expect(composed.payloadParts[0]?.text).not.toContain("output-path=");
    expect(composed.payloadParts[0]?.text).not.toContain("name=");
    expect(composed.payloadParts[0]?.text).not.toContain("allowed_workers:");
    expect(composed.payloadParts[0]?.text).toContain(
      'Write `message` for Gladiolus. Runtime will pass it as the canonical handoff text for the "implement" step.',
    );
    expect(composed.payloadParts[0]?.text).toContain(
      `Create the file at ${expectedSpecPlanPath} using the following format.`,
    );
    expect(
      composed.payloadParts[0]?.text.indexOf(
        `Create the file at ${expectedSpecPlanPath} using the following format.`,
      ) ?? -1,
    ).toBeLessThan(composed.payloadParts[0]?.text.indexOf("## Format") ?? Number.MAX_SAFE_INTEGER);
    expect(composed.payloadParts[0]?.text).not.toContain("[NOCTIS_ROUTED_MESSAGE]");
  });

  it("builds worker prompts through the workflow extension when operation state is active", () => {
    const root = createTempRoot();
    seedProjectConfig(root);
    const missionId = "mission-3";
    const { state: operationState, taskId, specPlanningTaskId } = buildSyntheticOperationState(missionId);
    const expectedSpecPlanPath = getMissionOutputFilePath(
      missionId,
      "spec-planning",
      specPlanningTaskId,
      "spec-plan.md",
    );

    const composed = composeWorkerTaskPrompt({
      context: {
        appRoot: root,
        agent: "gladiolus",
        sessionId: "worker-session",
        missionId,
      },
      missionId,
      agentId: "gladiolus",
      taskId,
      originalPrompt: "Task ID: task-1\nTask: implement the change",
      operationStateOverride: operationState,
    });

    expect(composed.usedWorkflowExtension).toBe(true);
    expect(composed.workflowExtension).toContain("<job");
    expect(composed.workflowExtension).toContain("<handoff>");
    expect(composed.workflowExtension).not.toContain("format=");
    expect(composed.effectivePrompt).not.toContain("<task>");
    expect(composed.effectivePrompt).toContain("<step-completion-contract");
    expect(composed.effectivePrompt).not.toContain("source=");
    expect(composed.effectivePrompt).not.toContain("output-path=");
    expect(composed.effectivePrompt).not.toContain("name=");
    expect(composed.effectivePrompt).toContain(
      `scripts/send_report.sh ${missionId} gladiolus ${taskId} review "<message>"`,
    );
    expect(composed.effectivePrompt).toContain("from_step: spec-planning");
    expect(composed.effectivePrompt).toContain("from_agent: noctis");
    expect(composed.effectivePrompt).toContain("Synthetic report from worker");
    expect(composed.effectivePrompt).toContain(
      'Write `message` for Ignis. Runtime will pass it as the canonical handoff text for the "review" step.',
    );
    expect(composed.effectivePrompt).toContain(
      'There is no next workflow step. Write `message` as the blocker summary that Noctis should use to explain why the workflow stopped.',
    );
    expect(composed.effectivePrompt).not.toContain("--rule-index <index>");
    expect(composed.sharedContext).toContain("<workspace-context");
    expect(composed.payloadParts[0]?.text).not.toContain("<delegation-context");
    expect(composed.effectivePrompt).toContain(expectedSpecPlanPath);
    expect(composed.effectivePrompt).not.toContain("{{ output(");
    expect(composed.payloadParts).toHaveLength(1);
  });

  it("keeps debug preview aligned with composed worker prompt structure", () => {
    const root = createTempRoot();
    seedProjectConfig(root);
    const missionId = "debug-mission";
    const { state: operationState, taskId } = buildSyntheticOperationState(missionId);
    const bundle = buildOperationDebugBundle({
      missionId,
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
        missionId,
      },
      missionId,
      agentId: "gladiolus",
      taskId,
      originalPrompt: "Synthetic task for gladiolus: implement the current step as Noctis instructed.",
      operationStateOverride: operationState,
    });

    expect(workerStep).toBeTruthy();
    expect(workerStep?.to).toBe("Gladiolus");
    expect(workerStep?.pathSummary).toBe("Noctis -> Runtime -> Gladiolus");
    expect(workerStep?.promptHighlights).toEqual([
      {
        source: "handoff",
        text: "Synthetic report from worker",
        stepName: "spec-planning",
        agent: "noctis",
        taskId: "step_spec-planning_1",
      },
    ]);
    expect(workerStep?.effectivePrompt).toBe(composed.effectivePrompt);
    expect(workerStep?.internalContext).toBe(composed.sharedContext);
  });

  it("follows runtime step transitions in the debug flow", () => {
    const root = createTempRoot();
    seedProjectConfig(root);
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
    const root = createTempRoot();
    seedProjectConfig(root);
    const missionId = "debug-self-step-preview";
    const bundle = buildOperationDebugBundle({
      missionId,
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
        missionId,
        allowedWorkers: ["ignis", "gladiolus", "prompto"],
      },
      userMessage: "This is a synthetic User message for operation activation.",
      missionId,
      sessionId: "debug-noctis-session",
      isNewMission: true,
      selectedOperation: "openspec-dev",
    });

    expect(selfStep).toBeTruthy();
    expect(selfStep?.pathSummary).toBe("User -> Runtime -> Noctis");
    expect(selfStep?.effectivePrompt).toBe(composed.effectivePrompt);
    expect(selfStep?.internalContext).toBe(composed.sharedContext);
    expect(selfStep?.sourceInput).toBe(composed.promptBody);
    expect(selfStep?.promptHighlights).toEqual([
      {
        source: "user-request",
        text: "This is a synthetic User message for operation activation.",
        agent: "user",
      },
    ]);
    expect(selfStep?.injectedPrompt).toBe(composed.workflowExtension);
    expect(selfStep?.effectivePrompt).not.toContain("allowed_workers:");
  });

  it("keeps both user-request and handoff highlights for Noctis reentry steps", () => {
    const root = createTempRoot();
    seedProjectConfig(root);
    writeNoctisReentryOperation(root);
    const userMessage = "Please summarize the current workflow state.";
    const bundle = buildOperationDebugBundle({
      operationName: "noctis-reentry-debug",
      userMessage,
    });
    const reentryStep = bundle.flowSteps.find(
      (step) => step.kind === "noctis-step" && step.stepName === "summarize",
    );

    expect(reentryStep).toBeTruthy();
    expect(reentryStep?.promptHighlights).toEqual([
      {
        source: "user-request",
        text: userMessage,
        agent: "user",
      },
      {
        source: "handoff",
        text: "Synthetic report from worker",
        stepName: "implement",
        agent: "gladiolus",
        taskId: "step_implement_2",
      },
    ]);
    expect(reentryStep?.effectivePrompt).toContain(userMessage);
    expect(reentryStep?.effectivePrompt).toContain("Synthetic report from worker");
  });

  it("renders one knowledge catalog for workflow prompts and keeps debug preview aligned", () => {
    const root = createTempRoot();
    seedProjectConfig(root);
    writeKnowledgeCatalogOperation(root);
    const missionId = "debug-knowledge-catalog";
    const userMessage = "Open the knowledge-catalog workflow.";
    const bundle = buildOperationDebugBundle({
      missionId,
      operationName: "knowledge-catalog-workflow",
      userMessage,
    });
    const selfStep = bundle.flowSteps.find(
      (step) => step.kind === "noctis-step" && step.stepName === "spec-planning",
    );

    const composed = composeUserToNoctisPrompt({
      context: {
        appRoot: root,
        agent: "noctis",
        sessionId: "debug-knowledge-catalog-session",
        missionId,
        allowedWorkers: ["ignis", "gladiolus", "prompto"],
      },
      userMessage,
      missionId,
      sessionId: "debug-knowledge-catalog-session",
      isNewMission: true,
      selectedOperation: "knowledge-catalog-workflow",
    });

    expect(composed.effectivePrompt).toContain("<knowledge-catalog>");
    expect(composed.effectivePrompt.match(/<knowledge-catalog>/g)).toHaveLength(1);
    expect(composed.effectivePrompt).toContain("<knowledge-ref>");
    expect(composed.effectivePrompt).toContain("<knowledge-body>");
    expect(composed.effectivePrompt).toContain("Name: operation-system-contract");
    expect(composed.effectivePrompt).toContain("Name: agent-relationships");
    expect(composed.effectivePrompt).toContain(
      "Reference entries below are reference cards, not full knowledge documents.",
    );
    expect(
      composed.effectivePrompt.match(/Reference entries below are reference cards, not full knowledge documents\./g) ?? [],
    ).toHaveLength(1);
    expect(composed.effectivePrompt).not.toContain("This text should not be injected into the prompt.");
    expect(composed.effectivePrompt).not.toContain("This text should also stay out of the prompt body.");
    expect(selfStep).toBeTruthy();
    expect(selfStep?.effectivePrompt).toBe(composed.effectivePrompt);
  });

  it("fails Noctis activation prompt generation when an output contract is malformed", () => {
    const root = createTempRoot();
    seedProjectConfig(root);
    writeMalformedOutputContractOperation(root);

    expect(() =>
      composeUserToNoctisPrompt({
        context: {
          appRoot: root,
          agent: "noctis",
          sessionId: "session-malformed",
          missionId: "mission-malformed",
          allowedWorkers: ["ignis", "gladiolus", "prompto"],
        },
        userMessage: "Open the malformed workflow.",
        missionId: "mission-malformed",
        sessionId: "session-malformed",
        isNewMission: true,
        selectedOperation: "malformed-output-contract",
      }),
    ).toThrow(/## Format.*## Rule/i);
  });

  it("fails debug preview generation when an output contract is malformed", () => {
    const root = createTempRoot();
    seedProjectConfig(root);
    writeMalformedOutputContractOperation(root);

    expect(() =>
      buildOperationDebugBundle({
        missionId: "mission-malformed-preview",
        operationName: "malformed-output-contract",
      }),
    ).toThrow(/## Format.*## Rule/i);
  });

  it("builds an autonomous Noctis prompt with delegation guidance", () => {
    const root = createTempRoot();
    seedProjectConfig(root);

    const composed = composeUserToNoctisPrompt({
      context: {
        appRoot: root,
        agent: "noctis",
        sessionId: "session-autonomous",
        missionId: "mission-autonomous",
        allowedWorkers: ["ignis", "gladiolus"],
      },
      userMessage: "Help me move this task forward.",
      missionId: "mission-autonomous",
      sessionId: "session-autonomous",
      isNewMission: true,
      selectedOperation: "noctis-autonomous",
    });

    expect(composed.operationActivated).toBe("noctis-autonomous");
    expect(composed.effectivePrompt).toContain("<delegation-guidance>");
    expect(composed.effectivePrompt).toContain("scripts/send_task.sh mission-autonomous ignis");
    expect(composed.effectivePrompt).not.toContain("<step-completion-contract>");
    expect(composed.effectivePrompt).not.toContain("allowed_workers:");
  });

  it("builds delegated child worker prompts from delegation facets", () => {
    const root = createTempRoot();
    seedProjectConfig(root);
    const { state, childTaskId } = buildSyntheticAutonomousOperationState();

    const composed = composeWorkerTaskPrompt({
      context: {
        appRoot: root,
        agent: "ignis",
        sessionId: "session-ignis-autonomous",
        missionId: "mission-autonomous-worker",
      },
      missionId: "mission-autonomous-worker",
      agentId: "ignis",
      taskId: childTaskId,
      originalPrompt: "Investigate the current issue and report back to Noctis.",
      operationStateOverride: state,
    });

    expect(composed.usedWorkflowExtension).toBe(true);
    expect(composed.effectivePrompt).toContain("<task>");
    expect(composed.effectivePrompt).toContain("Investigate the current issue and report back to Noctis.");
    expect(composed.effectivePrompt).toContain("<job>");
    expect(composed.effectivePrompt).toContain("Delegated Worker");
    expect(composed.effectivePrompt).not.toContain("<delegation-guidance>");
    expect(composed.effectivePrompt).not.toContain("<step-completion-contract>");
  });

  it("shows delegated child execution as a same-step subordinate path in debug preview", () => {
    const root = createTempRoot();
    seedProjectConfig(root);
    const bundle = buildOperationDebugBundle({
      missionId: "mission-autonomous-preview",
      operationName: "noctis-autonomous",
      taskInstruction: "Investigate the current issue and report back to Noctis.",
    });

    expect(
      bundle.flowSteps.map((step) => `${step.kind}:${step.pathSummary}:${step.decisionSummary}`),
    ).toEqual([
      "noctis-step:User -> Runtime -> Noctis:delegate_child_task -> Ignis (autonomous)",
      "worker-step:User -> Runtime -> Ignis -> Runtime -> Noctis:return_to_self_step -> Noctis (autonomous)",
    ]);
    expect(bundle.flowSteps[0]?.effectivePrompt).toContain("<delegation-guidance>");
    expect(bundle.flowSteps[1]?.effectivePrompt).toContain("<task>");
    expect(bundle.flowSteps[1]?.runtimeDecision).toContain("next_action: return_to_self_step");
  });
});