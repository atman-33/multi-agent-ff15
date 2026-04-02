import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadOperationFromFile } from "@/lib/operation-definition/operation-loader";
import { resolveStepFacets } from "@/lib/operation-definition/facet-loader";
import { createOperationState } from "@/lib/operation-runtime/state";
import { buildActivationInstruction } from "./operation-prompt-builder";

const tempDirs: string[] = [];

function createInlinePromptFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operation-prompt-builder-"));
  tempDirs.push(root);

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
      "            inline: '# Spec Plan Format'",
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

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe("operation prompt builder", () => {
  it("emits deterministic source locators for inline facet content", () => {
    const operation = loadOperationFromFile(createInlinePromptFixture());
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
      reportDir: "/tmp/reports",
      missionId: "mission-inline",
      taskId: "task-inline",
    });

    expect(prompt).toContain(`source="${operation.sourcePath}#steps.spec-planning.job.inline"`);
    expect(prompt).toContain(
      `source="${operation.sourcePath}#steps.spec-planning.instruction.inline"`,
    );
    expect(prompt).toContain(
      `source="${operation.sourcePath}#steps.spec-planning.knowledge[0].inline"`,
    );
    expect(prompt).toContain(
      `source="${operation.sourcePath}#steps.spec-planning.policies[0].inline"`,
    );
    expect(prompt).toContain(
      `source="${operation.sourcePath}#steps.spec-planning.output_contracts.report[0].format.inline"`,
    );
  });
});