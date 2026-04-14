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
  mkdirSync(join(facetsDir, "skills", "operation-system-contract"), { recursive: true });
  mkdirSync(join(facetsDir, "skills", "agent-relationships"), { recursive: true });
  mkdirSync(join(facetsDir, "skills", "broken-reference"), { recursive: true });
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
    join(facetsDir, "skills", "operation-system-contract", "SKILL.md"),
    [
      "---",
      "name: operation-system-contract",
      'description: Read when changing runtime-owned dispatch or report routing.',
      "---",
      "# Operation Runtime and Prompt Flow Skill",
      "",
      "This is the full skill body.",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(facetsDir, "skills", "agent-relationships", "SKILL.md"),
    [
      "---",
      "name: agent-relationships",
      'description: Read when you need a compact FF15 relationship cue.',
      "---",
      "# Agent relationships",
      "",
      "Use this when party dynamics matter.",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(facetsDir, "skills", "broken-reference", "SKILL.md"),
    [
      "---",
      "name: broken-reference",
      "---",
      "# Broken reference body",
      "",
      "This malformed skill should be rejected.",
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
      "    skills:",
      "      - file: ../facets/skills/operation-system-contract/SKILL.md",
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
      "    skills:",
      "      - file: ../facets/skills/operation-system-contract/SKILL.md",
      "      - file: ../facets/skills/agent-relationships/SKILL.md",
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
    expect(planning?.skills).toEqual([{ file: "../facets/skills/operation-system-contract/SKILL.md" }]);

    if (!planning) {
      throw new Error("spec-planning step not found");
    }

    const facets = resolveStepFacets(operation, planning, "ja");

    expect(facets.job).toContain("Planner (仕様計画担当)");
    expect(facets.skills[0]).toEqual(
      expect.objectContaining({
        name: "operation-system-contract",
        description: "Read when changing runtime-owned dispatch or report routing.",
        file: expect.stringContaining("operation-system-contract/SKILL.md"),
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

  it("loads file-backed skill entries in authored order", () => {
    const operation = loadOperationFromFile(createTempOperationFixture());
    const implement = operation.steps.find((step) => step.name === "implement");

    expect(implement).toBeTruthy();
    expect(implement?.skills).toEqual([
      { file: "../facets/skills/operation-system-contract/SKILL.md" },
      { file: "../facets/skills/agent-relationships/SKILL.md" },
    ]);
    expect(implement?.policies).toEqual([
      { file: "../facets/policies/coding-standards.md" },
      { inline: "Keep changes minimal." },
    ]);

    if (!implement) {
      throw new Error("implement step not found");
    }

    const facets = resolveStepFacets(operation, implement, "ja");

    expect(facets.skills).toHaveLength(2);
    expect(facets.skills[0]).toEqual(
      expect.objectContaining({
        name: "operation-system-contract",
      }),
    );
    expect(facets.skills[1]).toEqual(
      expect.objectContaining({
        name: "agent-relationships",
      }),
    );
    expect(facets.policies[0]).toContain("Coding Standards");
    expect(facets.policies[1]).toContain("Keep changes minimal.");
  });

  it("rejects malformed skill entry metadata", () => {
    const operation = loadOperationFromFile(createTempOperationFixture());
    const implement = operation.steps.find((step) => step.name === "implement");

    if (!implement) {
      throw new Error("implement step not found");
    }

    implement.skills = [{ file: "../facets/skills/broken-reference/SKILL.md" }];

    expect(() => resolveStepFacets(operation, implement, "ja")).toThrow(
      /Skill entry must define non-empty name and description/i,
    );
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