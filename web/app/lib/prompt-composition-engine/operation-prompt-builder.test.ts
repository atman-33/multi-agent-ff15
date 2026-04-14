import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getMissionOutputFilePath } from "@/lib/mission-store";
import { buildBuiltinOperationRef } from "@/lib/operation-definition/operation-catalog";
import { loadOperationFromFile } from "@/lib/operation-definition/operation-loader";
import { resolveStepFacets } from "@/lib/operation-definition/facet-loader";
import { createOperationState } from "@/lib/operation-runtime/state";
import type { WorkerAgentId } from "@/lib/types/mission";
import { buildActivationInstruction } from "./operation-prompt-builder";

const tempDirs: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const CANONICAL_SPEC_PLAN_CONTRACT = [
  "## Format",
  "",
  "````markdown",
  "---",
  "change_name: synthetic-spec-plan",
  "````",
  "",
  "## Rule",
  "",
  "- `change_name` is required",
].join("\n");

function createTestOperationState(operation: {
  initial_step: string;
  name: string;
  sourcePath: string;
}) {
  return createOperationState(
    operation.name,
    operation.initial_step,
    buildBuiltinOperationRef("ja", basename(operation.sourcePath)),
  );
}

function createInlinePromptFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operation-prompt-builder-"));
  tempDirs.push(root);
  process.env.MULTI_AGENT_FF15_ROOT = root;

  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");

  const operationDir = join(root, "builtins", "ja", "operations");
  mkdirSync(operationDir, { recursive: true });

  const operationFilePath = join(operationDir, "inline-operation.yaml");
  writeFileSync(
    operationFilePath,
    [
      "name: inline-operation",
      "description: Inline prompt builder fixture",
      "initial_step: spec-planning",
      "steps:",
      "  - name: spec-planning",
      "    agent: noctis",
      "    job:",
      "      inline: Planner role",
      "    instruction:",
      "      inline: Clarify the request",
      "    policies:",
      "      - inline: Keep changes minimal",
      "    output_contracts:",
      "      report:",
      "        - name: spec-plan.md",
      "          format:",
      `            inline: ${JSON.stringify(CANONICAL_SPEC_PLAN_CONTRACT)}`,
      "    rules:",
      "      - condition: Ready",
      "        next: implement",
      "  - name: implement",
      "    agent: gladiolus",
      "    job:",
      "      inline: Implementer role",
      "    instruction:",
      "      inline: Implement the approved plan",
      "    rules:",
      "      - condition: Done",
      "        next: COMPLETE",
      "",
    ].join("\n"),
    "utf-8",
  );

  return operationFilePath;
}

function createPlaceholderPromptFixture(selector: string): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operation-placeholder-"));
  tempDirs.push(root);
  process.env.MULTI_AGENT_FF15_ROOT = root;

  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");

  const operationDir = join(root, "builtins", "ja", "operations");
  mkdirSync(operationDir, { recursive: true });

  const operationFilePath = join(operationDir, "placeholder-operation.yaml");
  writeFileSync(
    operationFilePath,
    [
      "name: placeholder-operation",
      "description: Placeholder prompt builder fixture",
      "initial_step: spec-planning",
      "steps:",
      "  - name: spec-planning",
      "    agent: noctis",
      "    job:",
      "      inline: Planner role",
      "    instruction:",
      "      inline: Produce the spec plan output.",
      "    output_contracts:",
      "      report:",
      "        - name: spec-plan.md",
      "          format:",
      `            inline: ${JSON.stringify(CANONICAL_SPEC_PLAN_CONTRACT)}`,
      "    rules:",
      "      - condition: Ready",
      "        next: implement",
      "  - name: implement",
      "    agent: gladiolus",
      "    job:",
      "      inline: Implementer role",
      "    instruction:",
      `      inline: Read {{ output("spec-planning", "${selector}", "spec-plan.md") }} before coding.`,
      "    rules:",
      "      - condition: Done",
      "        next: COMPLETE",
      "",
    ].join("\n"),
    "utf-8",
  );

  return operationFilePath;
}

function createSkillsPromptFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operation-skills-"));
  tempDirs.push(root);
  process.env.MULTI_AGENT_FF15_ROOT = root;

  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");

  const operationDir = join(root, "builtins", "ja", "operations");
  const skillsDir = join(root, "builtins", "ja", "facets", "skills");
  mkdirSync(operationDir, { recursive: true });
  mkdirSync(join(skillsDir, "operation-system-contract"), { recursive: true });
  mkdirSync(join(skillsDir, "agent-relationships"), { recursive: true });

  writeFileSync(
    join(skillsDir, "operation-system-contract", "SKILL.md"),
    [
      "---",
      "name: operation-system-contract",
      'description: Read when changing runtime-owned dispatch or report routing.',
      'argument-hint: runtime dispatch',
      "---",
      "# Full contract body",
      "",
      "This text should not be injected into the prompt.",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(skillsDir, "agent-relationships", "SKILL.md"),
    [
      "---",
      "name: agent-relationships",
      'description: Read when you need a compact FF15 relationship cue.',
      "metadata:",
      '  owner: ff15',
      "---",
      "# Agent relationships",
      "",
      "This text should also stay out of the prompt body.",
      "",
    ].join("\n"),
    "utf-8",
  );

  const operationFilePath = join(operationDir, "skills-operation.yaml");
  writeFileSync(
    operationFilePath,
    [
      "name: skills-operation",
      "description: Skills prompt fixture",
      "initial_step: spec-planning",
      "steps:",
      "  - name: spec-planning",
      "    agent: noctis",
      "    job:",
      "      inline: Planner role",
      "    instruction:",
      "      inline: Clarify the request",
      "    skills:",
      "      - file: ../facets/skills/operation-system-contract/SKILL.md",
      "      - file: ../facets/skills/agent-relationships/SKILL.md",
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

  return operationFilePath;
}

afterEach(() => {
  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }

  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe("operation prompt builder", () => {
  it("emits attribute-free prompts with mission-scoped output guidance", () => {
    const operationPath = createInlinePromptFixture();
    const operation = loadOperationFromFile(operationPath);
    const step = operation.steps[0];

    if (!step) {
      throw new Error("spec-planning step not found");
    }

    const facets = resolveStepFacets(operation, step, "ja");
    const operationState = createTestOperationState(operation);
    const prompt = buildActivationInstruction({
      operation,
      step,
      operationState,
      facets,
      missionId: "mission-inline",
      taskId: "task-inline",
    });
    const expectedOutputPath = getMissionOutputFilePath(
      "mission-inline",
      "spec-planning",
      "task-inline",
      "spec-plan.md",
    );
    const expectedGuidance = `Create the file at ${expectedOutputPath} using the following format.`;

    expect(prompt).toContain("<job>");
    expect(prompt).toContain("<instruction>");
    expect(prompt).toContain("<output-contract>");
    expect(prompt).not.toContain("<handoff>");
    expect(prompt).not.toContain("<task>");
    expect(prompt).not.toContain("source=");
    expect(prompt).not.toContain("format=");
    expect(prompt).not.toContain("output-path=");
    expect(prompt).not.toContain("name=");
    expect(prompt).toContain(expectedGuidance);
    expect(prompt.indexOf(expectedGuidance)).toBeLessThan(prompt.indexOf("## Format"));
  });

  it("injects a handoff section from the previous completed step summary", () => {
    const operation = loadOperationFromFile(createInlinePromptFixture());
    const step = operation.steps.find((candidate) => candidate.name === "implement");

    if (!step) {
      throw new Error("implement step not found");
    }

    const facets = resolveStepFacets(operation, step, "ja");
    const operationState = createTestOperationState(operation);
    operationState.currentStep = "implement";
    operationState.stepHistory = [
      {
        step: "spec-planning",
        agent: "noctis",
        taskId: "step_spec-planning_1",
        status: "completed",
        nextStep: "implement",
        dispatchedAt: "2026-04-03T00:00:00.000Z",
        completedAt: "2026-04-03T00:01:00.000Z",
        summary: [
          "OpenSpec planning is approved.",
          "Read spec-plan.md before implementation.",
        ].join("\n"),
      },
    ];

    const prompt = buildActivationInstruction({
      operation,
      step,
      operationState,
      facets,
      missionId: "mission-handoff",
      taskId: "task-implement-1",
    });

    expect(prompt).toContain("<handoff>");
    expect(prompt).toContain("from_step: spec-planning");
    expect(prompt).toContain("from_agent: noctis");
    expect(prompt).toContain("task_id: step_spec-planning_1");
    expect(prompt).toContain("message: |");
    expect(prompt).toContain("  OpenSpec planning is approved.");
    expect(prompt).toContain("  Read spec-plan.md before implementation.");
    expect(prompt).not.toContain("<task>");
  });

  it("emits a grouped skills section with name and description only", () => {
    const operation = loadOperationFromFile(createSkillsPromptFixture());
    const step = operation.steps[0];

    if (!step) {
      throw new Error("spec-planning step not found");
    }

    const facets = resolveStepFacets(operation, step, "ja");
    const operationState = createTestOperationState(operation);
    const prompt = buildActivationInstruction({
      operation,
      step,
      operationState,
      facets,
      missionId: "mission-skills",
      taskId: "task-skills",
    });

    expect(prompt).toContain("<skills>");
    expect(prompt).toContain("<skill>");
    expect(prompt).toContain("<name>");
    expect(prompt).toContain("operation-system-contract");
    expect(prompt).toContain("agent-relationships");
    expect(prompt).toContain("<description>");
    expect(prompt).toContain(
      "Use the skills below only when the current task matches their description.",
    );
    expect(prompt).not.toContain("<file>");
    expect(prompt).not.toContain("argument-hint");
    expect(prompt).not.toContain("metadata");
    expect(prompt).not.toContain("This text should not be injected into the prompt.");
    expect(prompt).not.toContain("This text should also stay out of the prompt body.");
    expect(prompt.indexOf("operation-system-contract")).toBeLessThan(
      prompt.indexOf("agent-relationships"),
    );
  });

  it("resolves latest output placeholders to absolute paths", () => {
    const operation = loadOperationFromFile(createPlaceholderPromptFixture("latest"));
    const step = operation.steps.find((candidate) => candidate.name === "implement");

    if (!step) {
      throw new Error("implement step not found");
    }

    const outputPath = getMissionOutputFilePath(
      "mission-latest",
      "spec-planning",
      "step_spec-planning_1",
      "spec-plan.md",
    );
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, "---\nchange_name: test-change\n---\n", "utf-8");

    const facets = resolveStepFacets(operation, step, "ja");
    const operationState = createTestOperationState(operation);
    operationState.currentStep = "implement";
    operationState.stepHistory = [
      {
        step: "spec-planning",
        agent: "noctis",
        taskId: "step_spec-planning_1",
        status: "completed",
        dispatchedAt: "2026-04-03T00:00:00.000Z",
        completedAt: "2026-04-03T00:01:00.000Z",
      },
    ];

    const prompt = buildActivationInstruction({
      operation,
      step,
      operationState,
      facets,
      missionId: "mission-latest",
      taskId: "task-implement-1",
    });

    expect(prompt).toContain(outputPath);
  });

  it("resolves explicit task output placeholders to absolute paths", () => {
    const operation = loadOperationFromFile(
      createPlaceholderPromptFixture("task:step_spec-planning_2"),
    );
    const step = operation.steps.find((candidate) => candidate.name === "implement");

    if (!step) {
      throw new Error("implement step not found");
    }

    const outputPath = getMissionOutputFilePath(
      "mission-explicit",
      "spec-planning",
      "step_spec-planning_2",
      "spec-plan.md",
    );
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, "---\nchange_name: explicit-change\n---\n", "utf-8");

    const facets = resolveStepFacets(operation, step, "ja");
    const operationState = createTestOperationState(operation);
    operationState.currentStep = "implement";
    operationState.stepHistory = [
      {
        step: "spec-planning",
        agent: "noctis",
        taskId: "step_spec-planning_1",
        status: "completed",
        dispatchedAt: "2026-04-03T00:00:00.000Z",
        completedAt: "2026-04-03T00:01:00.000Z",
      },
      {
        step: "spec-planning",
        agent: "noctis",
        taskId: "step_spec-planning_2",
        status: "completed",
        dispatchedAt: "2026-04-03T00:02:00.000Z",
        completedAt: "2026-04-03T00:03:00.000Z",
      },
    ];

    const prompt = buildActivationInstruction({
      operation,
      step,
      operationState,
      facets,
      missionId: "mission-explicit",
      taskId: "task-implement-2",
    });

    expect(prompt).toContain(outputPath);
  });

  it("fails prompt generation when an output placeholder cannot be resolved", () => {
    const operation = loadOperationFromFile(createPlaceholderPromptFixture("latest"));
    const step = operation.steps.find((candidate) => candidate.name === "implement");

    if (!step) {
      throw new Error("implement step not found");
    }

    const facets = resolveStepFacets(operation, step, "ja");
    const operationState = createTestOperationState(operation);
    operationState.currentStep = "implement";
    operationState.stepHistory = [
      {
        step: "spec-planning",
        agent: "noctis",
        taskId: "step_spec-planning_1",
        status: "completed",
        dispatchedAt: "2026-04-03T00:00:00.000Z",
        completedAt: "2026-04-03T00:01:00.000Z",
      },
    ];

    expect(() =>
      buildActivationInstruction({
        operation,
        step,
        operationState,
        facets,
        missionId: "mission-missing",
        taskId: "task-implement-3",
      }),
    ).toThrow(/could not resolve output placeholder/i);
  });

  it("shows delegation-unavailable guidance when activation uses an empty effective worker set", () => {
    const operation = loadOperationFromFile(createInlinePromptFixture());
    const autonomousOperation = {
      ...operation,
      steps: [
        {
          ...operation.steps[0],
          name: "autonomous",
          delegation: {
            allowed_workers: ["ignis", "gladiolus"] as WorkerAgentId[],
            worker_job: { inline: "Delegated worker" },
            worker_instruction: { inline: "Support Noctis." },
            worker_skills: [],
            worker_policies: [],
          },
          rules: [],
        },
      ],
      initial_step: "autonomous",
    } as typeof operation;
    const step = autonomousOperation.steps[0];

    if (!step) {
      throw new Error("autonomous step not found");
    }

    const facets = resolveStepFacets(autonomousOperation, step, "ja");
    const operationState = createOperationState(
      autonomousOperation.name,
      autonomousOperation.initial_step,
      buildBuiltinOperationRef("ja", basename(autonomousOperation.sourcePath)),
    );
    const prompt = buildActivationInstruction({
      operation: autonomousOperation,
      step,
      operationState,
      facets,
      missionId: "mission-solo-guidance",
      taskId: "task-solo-guidance",
      allowedWorkersOverride: [],
    });

    expect(prompt).toContain("Effective allowed workers: none");
    expect(prompt).toContain("Continue the conversation yourself until delegation becomes available.");
    expect(prompt).not.toContain(
      `${process.env.MULTI_AGENT_FF15_ROOT}/scripts/send_task.sh mission-solo-guidance ignis`,
    );
    expect(prompt).not.toContain("<job>");
    expect(prompt).not.toContain("<skills>");
    expect(prompt).not.toContain("<instruction>");
  });
});