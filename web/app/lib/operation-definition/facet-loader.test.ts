import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveStepFacets } from "./facet-loader";
import { loadOperationFromFile } from "./operation-loader";

const tempDirs: string[] = [];

function createTempOperationFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-facet-loader-"));
  tempDirs.push(root);

  const operationDir = join(root, "builtins", "ja", "operations");
  const facetsDir = join(root, "builtins", "ja", "facets");

  mkdirSync(join(facetsDir, "jobs"), { recursive: true });
  mkdirSync(join(facetsDir, "instructions"), { recursive: true });
  mkdirSync(join(facetsDir, "knowledge"), { recursive: true });
  mkdirSync(join(facetsDir, "policies"), { recursive: true });
  mkdirSync(join(facetsDir, "output-contracts"), { recursive: true });
  mkdirSync(operationDir, { recursive: true });

  writeFileSync(join(facetsDir, "jobs", "planner.md"), "# Planner (仕様計画担当)\n", "utf-8");
  writeFileSync(
    join(facetsDir, "instructions", "openspec-planning.md"),
    "# Spec Planning — 手順指示\n",
    "utf-8",
  );
  writeFileSync(
    join(facetsDir, "knowledge", "operation-engine-and-builtins-injection.md"),
    "# Operation Runtime and Prompt Flow Knowledge\n",
    "utf-8",
  );
  writeFileSync(join(facetsDir, "jobs", "reviewer.md"), "# Code Review Report\n", "utf-8");
  writeFileSync(join(facetsDir, "instructions", "review-code.md"), "# Review\n", "utf-8");
  writeFileSync(
    join(facetsDir, "output-contracts", "code-review.md"),
    "# Code Review Report\n",
    "utf-8",
  );
  writeFileSync(join(facetsDir, "jobs", "implementer.md"), "# Implementer\n", "utf-8");
  writeFileSync(join(facetsDir, "instructions", "implement.md"), "# Implement\n", "utf-8");
  writeFileSync(join(facetsDir, "policies", "coding-standards.md"), "# Coding Standards\n", "utf-8");

  writeFileSync(
    join(operationDir, "test-operation.yaml"),
    [
      "name: test-operation",
      "description: Test operation",
      "initial_step: spec-planning",
      "steps:",
      "  - name: spec-planning",
      "    agent: noctis",
      "    job_file: ../facets/jobs/planner.md",
      "    instruction_file: ../facets/instructions/openspec-planning.md",
      "    knowledge_files:",
      "      - ../facets/knowledge/operation-engine-and-builtins-injection.md",
      "    rules: []",
      "  - name: review",
      "    agent: ignis",
      "    job_file: ../facets/jobs/reviewer.md",
      "    instruction_file: ../facets/instructions/review-code.md",
      "    output_contracts:",
      "      report:",
      "        - name: code-review.md",
      "          format_file: ../facets/output-contracts/code-review.md",
      "    rules: []",
      "  - name: implement",
      "    agent: gladiolus",
      "    job_file: ../facets/jobs/implementer.md",
      "    instruction_file: ../facets/instructions/implement.md",
      "    knowledge_files:",
      "      - ../facets/knowledge/operation-engine-and-builtins-injection.md",
      "    policy_files:",
      "      - ../facets/policies/coding-standards.md",
      "    rules: []",
      "",
    ].join("\n"),
    "utf-8",
  );

  return join(operationDir, "test-operation.yaml");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe("operation-definition path-based facet resolution", () => {
  it("loads step facets from markdown files relative to the operation yaml", () => {
    const operation = loadOperationFromFile(createTempOperationFixture());
    const planning = operation.steps.find((step) => step.name === "spec-planning");

    expect(planning).toBeTruthy();
    expect(planning?.job_file).toBe("../facets/jobs/planner.md");
    expect(planning?.instruction_file).toBe("../facets/instructions/openspec-planning.md");
    expect(planning?.knowledge_files).toEqual([
      "../facets/knowledge/operation-engine-and-builtins-injection.md",
    ]);

    if (!planning) {
      throw new Error("spec-planning step not found");
    }

    const facets = resolveStepFacets(operation, planning, "ja");

    expect(facets.job).toContain("Planner (仕様計画担当)");
    expect(facets.knowledge[0]).toContain("Operation Runtime and Prompt Flow Knowledge");
    expect(facets.instruction).toContain("Spec Planning — 手順指示");
    expect(facets.outputContracts).toEqual([]);
  });

  it("loads output contracts only for steps that define them", () => {
    const operation = loadOperationFromFile(createTempOperationFixture());
    const review = operation.steps.find((step) => step.name === "review");

    expect(review).toBeTruthy();

    if (!review) {
      throw new Error("review step not found");
    }

    const facets = resolveStepFacets(operation, review, "ja");

    expect(facets.outputContracts[0]).toContain("Code Review Report");
  });

  it("loads worker knowledge and policy files from operation-relative paths", () => {
    const operation = loadOperationFromFile(createTempOperationFixture());
    const implement = operation.steps.find((step) => step.name === "implement");

    expect(implement).toBeTruthy();
    expect(implement?.knowledge_files).toEqual([
      "../facets/knowledge/operation-engine-and-builtins-injection.md",
    ]);
    expect(implement?.policy_files).toEqual(["../facets/policies/coding-standards.md"]);

    if (!implement) {
      throw new Error("implement step not found");
    }

    const facets = resolveStepFacets(operation, implement, "ja");

    expect(facets.knowledge[0]).toContain("Operation Runtime and Prompt Flow Knowledge");
    expect(facets.policies[0]).toContain("Coding Standards");
  });
});