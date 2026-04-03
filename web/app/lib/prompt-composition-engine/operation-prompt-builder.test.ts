import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getMissionOutputFilePath } from "@/lib/mission-store";
import { loadOperationFromFile } from "@/lib/operation-definition/operation-loader";
import { resolveStepFacets } from "@/lib/operation-definition/facet-loader";
import { createOperationState } from "@/lib/operation-runtime/state";
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
      "    knowledge:",
      "      - inline: Runtime owns dispatch",
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

function createKnowledgeCatalogPromptFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operation-knowledge-catalog-"));
  tempDirs.push(root);
  process.env.MULTI_AGENT_FF15_ROOT = root;

  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");

  const operationDir = join(root, "builtins", "ja", "operations");
  const knowledgeDir = join(root, "builtins", "ja", "facets", "knowledge");
  mkdirSync(operationDir, { recursive: true });
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

  const operationFilePath = join(operationDir, "knowledge-catalog-operation.yaml");
  writeFileSync(
    operationFilePath,
    [
      "name: knowledge-catalog-operation",
      "description: Knowledge catalog fixture",
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
    const operationState = createOperationState(operation.name, operation.initial_step);
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
    const operationState = createOperationState(operation.name, operation.initial_step);
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

  it("emits a grouped knowledge catalog with reference and body entries", () => {
    const operation = loadOperationFromFile(createKnowledgeCatalogPromptFixture());
    const step = operation.steps[0];

    if (!step) {
      throw new Error("spec-planning step not found");
    }

    const facets = resolveStepFacets(operation, step, "ja");
    const operationState = createOperationState(operation.name, operation.initial_step);
    const prompt = buildActivationInstruction({
      operation,
      step,
      operationState,
      facets,
      missionId: "mission-knowledge",
      taskId: "task-knowledge",
    });

    expect(prompt).toContain("<knowledge-catalog>");
    expect(prompt).toContain("<knowledge-ref>");
    expect(prompt).toContain("Name: operation-system-contract");
    expect(prompt).toContain(
      "Description: Read when changing runtime-owned dispatch or report routing.",
    );
    expect(prompt).toContain("Source: ");
    expect(prompt).toContain("This is a reference card, not the full knowledge document.");
    expect(prompt).toContain("Critical facts:");
    expect(prompt).toContain("- Runtime decides the next actor.");
    expect(prompt).not.toContain("This text should not be injected into the prompt.");
    expect(prompt).toContain("<knowledge-body>");
    expect(prompt.indexOf("Name: operation-system-contract")).toBeLessThan(
      prompt.indexOf("# Broken reference body"),
    );
    expect(prompt.indexOf("# Broken reference body")).toBeLessThan(
      prompt.indexOf("Prefer runtime-owned dispatch."),
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
    const operationState = createOperationState(operation.name, operation.initial_step);
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
    const operationState = createOperationState(operation.name, operation.initial_step);
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
    const operationState = createOperationState(operation.name, operation.initial_step);
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
});