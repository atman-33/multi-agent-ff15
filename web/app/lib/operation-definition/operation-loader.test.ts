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
      "    job:",
      "      file: ./planner.md",
      "    instruction:",
      "      file: ./plan.md",
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
      "    job:",
      "      file: ./implementer.md",
      "    instruction:",
      "      file: ./implement.md",
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
      "    job:",
      "      file: ./implementer.md",
      "    instruction:",
      "      file: ./implement.md",
      "    rules: []",
      "",
    ].join("\n"));

    expect(() => loadOperationFromFile(filePath)).toThrow(/removed field "handoff_mode"/i);
  });

  it("rejects removed previous response injection fields inside steps", () => {
    const filePath = writeTempOperation([
      "name: legacy-previous-response-operation",
      "description: Legacy previous response operation",
      "initial_step: implement",
      "steps:",
      "  - name: implement",
      "    agent: noctis",
      "    job:",
      "      file: ./implementer.md",
      "    instruction:",
      "      file: ./implement.md",
      "    pass_previous_response: true",
      "    rules: []",
      "",
    ].join("\n"));

    expect(() => loadOperationFromFile(filePath)).toThrow(/removed field "pass_previous_response"/i);
  });

  it("loads step output contracts when they are defined", () => {
    const filePath = writeTempOperation([
      "name: test-operation",
      "description: Test operation",
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    job:",
      "      file: ./planner.md",
      "    instruction:",
      "      file: ./plan.md",
      "    rules:",
      "      - condition: Ready for review",
      "        next: review",
      "  - name: review",
      "    agent: ignis",
      "    job:",
      "      file: ./reviewer.md",
      "    instruction:",
      "      file: ./review.md",
      "    output_contracts:",
      "      report:",
      "        - name: code-review.md",
      "          format:",
      "            file: ./contract.md",
      "    rules: []",
      "",
    ].join("\n"));

    const operation = loadOperationFromFile(filePath);

    expect(operation.steps[1]?.output_contracts?.report[0]?.name).toBe("code-review.md");
    expect(operation.steps[1]?.output_contracts?.report[0]?.format).toEqual({ file: "./contract.md" });
  });

  it("loads canonical inline facets and file-backed skills", () => {
    const filePath = writeTempOperation([
      "name: inline-operation",
      "description: Inline operation",
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    job:",
      "      inline: Planner role",
      "    instruction:",
      "      inline: Clarify the request",
      "    skills:",
      "      - file: ./planner-skill/SKILL.md",
      "    policies:",
      "      - inline: Stay focused",
      "    output_contracts:",
      "      report:",
      "        - name: plan.md",
      "          format:",
      "            inline: '# Plan output'",
      "    rules: []",
      "",
    ].join("\n"));

    const operation = loadOperationFromFile(filePath);
    const planStep = operation.steps[0];

    expect(planStep?.job).toEqual({ inline: "Planner role" });
    expect(planStep?.instruction).toEqual({ inline: "Clarify the request" });
    expect(planStep?.skills).toEqual([{ file: "./planner-skill/SKILL.md" }]);
    expect(planStep?.policies).toEqual([{ inline: "Stay focused" }]);
    expect(planStep?.output_contracts?.report[0]?.format).toEqual({ inline: "# Plan output" });
  });

  it("rejects inline workflow skills", () => {
    const filePath = writeTempOperation([
      "name: invalid-skills-operation",
      "description: Invalid skills operation",
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    skills:",
      "      - inline: This must be rejected",
      "    rules: []",
      "",
    ].join("\n"));

    expect(() => loadOperationFromFile(filePath)).toThrow(/Workflow skills are file-only/i);
  });

  it("loads a rules-less Noctis delegation step", () => {
    const filePath = writeTempOperation([
      "name: delegated-operation",
      "description: Delegated operation",
      "initial_step: autonomous",
      "steps:",
      "  - name: autonomous",
      "    agent: noctis",
      "    job:",
      "      inline: Autonomous Noctis role",
      "    delegation:",
      "      allowed_workers:",
      "        - ignis",
      "        - gladiolus",
      "      worker_job:",
      "        inline: Delegated worker role",
      "      worker_instruction:",
      "        inline: Complete the child task and report back.",
      "      worker_skills:",
      "        - file: ./delegated-skill/SKILL.md",
      "",
    ].join("\n"));

    const operation = loadOperationFromFile(filePath);
    const step = operation.steps[0];

    expect(step?.name).toBe("autonomous");
    expect(step?.rules).toEqual([]);
    expect(step?.delegation?.allowed_workers).toEqual(["ignis", "gladiolus"]);
    expect(step?.delegation?.worker_job).toEqual({ inline: "Delegated worker role" });
    expect(step?.delegation?.worker_instruction).toEqual({
      inline: "Complete the child task and report back.",
    });
    expect(step?.delegation?.worker_skills).toEqual([{ file: "./delegated-skill/SKILL.md" }]);
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
      "    job:",
      "      file: ./planner.md",
      "    instruction:",
      "      file: ./plan.md",
      "    edit: true",
      "    rules: []",
      "",
    ].join("\n"));

    expect(() => loadOperationFromFile(filePath)).toThrow(/removed field "edit"/i);
  });

  it("rejects initial steps that are not assigned to Noctis", () => {
    const filePath = writeTempOperation([
      "name: invalid-operation",
      "description: Invalid operation",
      "initial_step: implement",
      "steps:",
      "  - name: implement",
      "    agent: gladiolus",
      "    job:",
      "      file: ./implementer.md",
      "    instruction:",
      "      file: ./implement.md",
      "    rules:",
      "      - condition: Done",
      "        next: COMPLETE",
      "",
    ].join("\n"));

    expect(() => loadOperationFromFile(filePath)).toThrow(/initial_step must be assigned to a primary mission agent/i);
  });

  it("accepts Lunafreya as an initial self-owned step", () => {
    const filePath = writeTempOperation([
      "name: lunafreya-autonomous",
      "description: Hidden Lunafreya workflow",
      "initial_step: reflect",
      "steps:",
      "  - name: reflect",
      "    agent: lunafreya",
      "    job:",
      "      inline: Reflective advisor role",
      "    instruction:",
      "      inline: Respond directly to User and maintain the mission context.",
      "    rules: []",
      "",
    ].join("\n"));

    const operation = loadOperationFromFile(filePath);

    expect(operation.initial_step).toBe("reflect");
    expect(operation.steps[0]?.agent).toBe("lunafreya");
  });

  it("rejects terminal next values in the initial Noctis step", () => {
    const filePath = writeTempOperation([
      "name: invalid-operation",
      "description: Invalid operation",
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    job:",
      "      file: ./planner.md",
      "    instruction:",
      "      file: ./plan.md",
      "    rules:",
      "      - condition: Abort",
      "        next: ABORT",
      "",
    ].join("\n"));

    expect(() => loadOperationFromFile(filePath)).toThrow(/must not use terminal next values/i);
  });

  it("rejects removed file-based facet field names", () => {
    const filePath = writeTempOperation([
      "name: invalid-operation",
      "description: Invalid operation",
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    job_file: ./planner.md",
      "    rules: []",
      "",
    ].join("\n"));

    expect(() => loadOperationFromFile(filePath)).toThrow(/removed field "job_file"/i);
  });

  it("rejects removed output contract format_file field names", () => {
    const filePath = writeTempOperation([
      "name: invalid-operation",
      "description: Invalid operation",
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    job:",
      "      file: ./planner.md",
      "    instruction:",
      "      file: ./plan.md",
      "    output_contracts:",
      "      report:",
      "        - name: plan.md",
      "          format_file: ./plan-format.md",
      "    rules: []",
      "",
    ].join("\n"));

    expect(() => loadOperationFromFile(filePath)).toThrow(/removed field "format_file"/i);
  });
});