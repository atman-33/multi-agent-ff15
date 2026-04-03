import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveStepFacets } from "./facet-loader";
import { loadOperationFromFile } from "./operation-loader";

const tempDirs: string[] = [];
const CANONICAL_CODE_REVIEW_CONTRACT = [
  "## Format",
  "",
  "````markdown",
  "# Inline Code Review Report",
  "````",
  "",
  "## Rule",
  "",
  "- Include evidence for blocking findings.",
].join("\n");

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
    join(facetsDir, "knowledge", "operation-system-contract.md"),
    [
      "---",
      "name: operation-system-contract",
      'description: Read when changing runtime-owned dispatch or report routing.',
      "critical:",
      "  - Runtime decides the next actor.",
      "  - Reports use taskId + next + message.",
      "---",
      "# Operation Runtime and Prompt Flow Knowledge",
      "",
      "This is the full knowledge body.",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(facetsDir, "knowledge", "broken-reference.md"),
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
  writeFileSync(join(facetsDir, "jobs", "reviewer.md"), "# Code Review Report\n", "utf-8");
  writeFileSync(join(facetsDir, "instructions", "review-code.md"), "# Review\n", "utf-8");
  writeFileSync(
    join(facetsDir, "output-contracts", "code-review.md"),
    `${CANONICAL_CODE_REVIEW_CONTRACT}\n`,
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
      "    job:",
      "      file: ../facets/jobs/planner.md",
      "    instruction:",
      "      file: ../facets/instructions/openspec-planning.md",
      "    knowledge:",
      "      - file: ../facets/knowledge/operation-system-contract.md",
      "    rules: []",
      "  - name: review",
      "    agent: ignis",
      "    job:",
      "      file: ../facets/jobs/reviewer.md",
      "    instruction:",
      "      inline: Review the submitted code carefully.",
      "    output_contracts:",
      "      report:",
      "        - name: code-review.md",
      "          format:",
      `            inline: ${JSON.stringify(CANONICAL_CODE_REVIEW_CONTRACT)}`,
      "    rules: []",
      "  - name: implement",
      "    agent: gladiolus",
      "    job:",
      "      file: ../facets/jobs/implementer.md",
      "    instruction:",
      "      file: ../facets/instructions/implement.md",
      "    knowledge:",
      "      - file: ../facets/knowledge/operation-system-contract.md",
      "      - file: ../facets/knowledge/broken-reference.md",
      "      - inline: Prefer runtime-owned dispatch.",
      "    policies:",
      "      - file: ../facets/policies/coding-standards.md",
      "      - inline: Keep changes minimal.",
      "    rules: []",
      "",
    ].join("\n"),
    "utf-8",
  );

  return join(operationDir, "test-operation.yaml");
}

function createMalformedOutputContractFixture(sourceType: "inline" | "file"): string {
  const root = mkdtempSync(join(tmpdir(), `multi-agent-ff15-facet-loader-${sourceType}-`));
  tempDirs.push(root);

  const operationDir = join(root, "builtins", "ja", "operations");
  const facetsDir = join(root, "builtins", "ja", "facets");

  mkdirSync(join(facetsDir, "output-contracts"), { recursive: true });
  mkdirSync(operationDir, { recursive: true });

  const brokenContractPath = join(facetsDir, "output-contracts", "broken-code-review.md");
  writeFileSync(brokenContractPath, "# Broken Output Contract\n", "utf-8");

  const formatSource =
    sourceType === "inline"
      ? `            inline: ${JSON.stringify("# Broken Output Contract")}`
      : "            file: ../facets/output-contracts/broken-code-review.md";

  writeFileSync(
    join(operationDir, `malformed-${sourceType}-operation.yaml`),
    [
      `name: malformed-${sourceType}-operation`,
      "description: Malformed output contract fixture",
      "initial_step: spec-planning",
      "steps:",
      "  - name: spec-planning",
      "    agent: noctis",
      "    instruction:",
      "      inline: Hand off to review.",
      "    rules:",
      "      - condition: Ready",
      "        next: review",
      "  - name: review",
      "    agent: ignis",
      "    instruction:",
      "      inline: Review carefully.",
      "    output_contracts:",
      "      report:",
      "        - name: code-review.md",
      "          format:",
      formatSource,
      "    rules: []",
      "",
    ].join("\n"),
    "utf-8",
  );

  return join(operationDir, `malformed-${sourceType}-operation.yaml`);
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
    expect(planning?.job).toEqual({ file: "../facets/jobs/planner.md" });
    expect(planning?.instruction).toEqual({ file: "../facets/instructions/openspec-planning.md" });
    expect(planning?.knowledge).toEqual([{ file: "../facets/knowledge/operation-system-contract.md" }]);

    if (!planning) {
      throw new Error("spec-planning step not found");
    }

    const facets = resolveStepFacets(operation, planning, "ja");

    expect(facets.job).toContain("Planner (仕様計画担当)");
    expect(facets.knowledge[0]).toEqual(
      expect.objectContaining({
        kind: "reference",
        name: "operation-system-contract",
        description: "Read when changing runtime-owned dispatch or report routing.",
        critical: ["Runtime decides the next actor.", "Reports use taskId + next + message."],
        source: expect.stringContaining("operation-system-contract.md"),
      }),
    );
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

    expect(facets.instruction).toContain("Review the submitted code carefully.");
    expect(facets.outputContracts[0]).toContain("## Format");
    expect(facets.outputContracts[0]).toContain("## Rule");
    expect(facets.outputContracts[0]).toContain("Inline Code Review Report");
  });

  it("loads mixed worker knowledge entries in authored order", () => {
    const operation = loadOperationFromFile(createTempOperationFixture());
    const implement = operation.steps.find((step) => step.name === "implement");

    expect(implement).toBeTruthy();
    expect(implement?.knowledge).toEqual([
      { file: "../facets/knowledge/operation-system-contract.md" },
      { file: "../facets/knowledge/broken-reference.md" },
      { inline: "Prefer runtime-owned dispatch." },
    ]);
    expect(implement?.policies).toEqual([
      { file: "../facets/policies/coding-standards.md" },
      { inline: "Keep changes minimal." },
    ]);

    if (!implement) {
      throw new Error("implement step not found");
    }

    const facets = resolveStepFacets(operation, implement, "ja");

    expect(facets.knowledge.map((entry) => entry.kind)).toEqual(["reference", "body", "body"]);
    expect(facets.knowledge[0]).toEqual(
      expect.objectContaining({
        kind: "reference",
        name: "operation-system-contract",
      }),
    );
    expect(facets.knowledge[1]).toEqual(
      expect.objectContaining({
        kind: "body",
        content: expect.stringContaining("# Broken reference body"),
      }),
    );
    if (facets.knowledge[1]?.kind !== "body") {
      throw new Error("Expected second knowledge entry to be body-backed");
    }
    expect(facets.knowledge[1].content).not.toContain("name: broken-reference");
    expect(facets.knowledge[2]).toEqual({
      kind: "body",
      content: "Prefer runtime-owned dispatch.",
    });
    expect(facets.policies[0]).toContain("Coding Standards");
    expect(facets.policies[1]).toContain("Keep changes minimal.");
  });

  it("rejects malformed inline output contracts with source-aware errors", () => {
    const operation = loadOperationFromFile(createMalformedOutputContractFixture("inline"));
    const review = operation.steps.find((step) => step.name === "review");

    if (!review) {
      throw new Error("review step not found");
    }

    expect(() => resolveStepFacets(operation, review, "ja")).toThrow(
      /output_contracts\.report\[0\]\.format\.inline.*## Format.*## Rule/i,
    );
  });

  it("rejects malformed file output contracts with source-aware errors", () => {
    const operation = loadOperationFromFile(createMalformedOutputContractFixture("file"));
    const review = operation.steps.find((step) => step.name === "review");

    if (!review) {
      throw new Error("review step not found");
    }

    expect(() => resolveStepFacets(operation, review, "ja")).toThrow(
      /broken-code-review\.md.*## Format.*## Rule/i,
    );
  });
});