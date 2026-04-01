import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadOperationFromFile } from "./operation-loader";

const tempDirs: string[] = [];

function writeTempOperation(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operation-loader-"));
  tempDirs.push(directory);

  const filePath = join(directory, "operation.yaml");
  writeFileSync(filePath, contents, "utf-8");
  return filePath;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe("operation loader", () => {
  it("loads the step-based schema without handoff configuration", () => {
    const filePath = writeTempOperation([
      "name: test-operation",
      "description: Test operation",
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    job_file: ./planner.md",
      "    instruction_file: ./plan.md",
      "    rules: []",
      "",
    ].join("\n"));

    const operation = loadOperationFromFile(filePath);

    expect(operation.initial_step).toBe("plan");
    expect(operation.steps).toHaveLength(1);
    expect(operation.steps[0]?.name).toBe("plan");
    expect(operation.steps[0]?.output_contracts).toBeUndefined();
  });

  it("rejects removed handoff configuration at the operation root", () => {
    const filePath = writeTempOperation([
      "name: handoff-operation",
      "description: Handoff operation",
      "initial_step: implement",
      "handoff_mode: auto",
      "steps:",
      "  - name: implement",
      "    agent: gladiolus",
      "    job_file: ./implementer.md",
      "    instruction_file: ./implement.md",
      "    rules: []",
      "",
    ].join("\n"));

    expect(() => loadOperationFromFile(filePath)).toThrow(/removed field\(s\): handoff_mode/i);
  });

  it("rejects removed handoff configuration inside steps", () => {
    const filePath = writeTempOperation([
      "name: step-handoff-operation",
      "description: Step handoff operation",
      "initial_step: implement",
      "steps:",
      "  - name: implement",
      "    agent: gladiolus",
      "    handoff_mode: manual",
      "    job_file: ./implementer.md",
      "    instruction_file: ./implement.md",
      "    rules: []",
      "",
    ].join("\n"));

    expect(() => loadOperationFromFile(filePath)).toThrow(/removed field "handoff_mode"/i);
  });

  it("loads step output contracts when they are defined", () => {
    const filePath = writeTempOperation([
      "name: test-operation",
      "description: Test operation",
      "initial_step: review",
      "steps:",
      "  - name: review",
      "    agent: ignis",
      "    job_file: ./reviewer.md",
      "    instruction_file: ./review.md",
      "    output_contracts:",
      "      report:",
      "        - name: code-review.md",
      "          format_file: ./contract.md",
      "    rules: []",
      "",
    ].join("\n"));

    const operation = loadOperationFromFile(filePath);

    expect(operation.steps[0]?.output_contracts?.report[0]?.name).toBe("code-review.md");
  });

  it("rejects removed legacy root fields", () => {
    const filePath = writeTempOperation([
      "name: legacy-operation",
      "description: Legacy operation",
      "initial_step: plan",
      "initial_movement: plan",
      "max_movements: 5",
      "steps: []",
      "movements: []",
      "",
    ].join("\n"));

    expect(() => loadOperationFromFile(filePath)).toThrow(
      /removed field\(s\): initial_movement, movements, max_movements/i,
    );
  });

  it("rejects removed edit fields inside steps", () => {
    const filePath = writeTempOperation([
      "name: invalid-operation",
      "description: Invalid operation",
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    job_file: ./planner.md",
      "    instruction_file: ./plan.md",
      "    edit: true",
      "    rules: []",
      "",
    ].join("\n"));

    expect(() => loadOperationFromFile(filePath)).toThrow(/removed field "edit"/i);
  });
});