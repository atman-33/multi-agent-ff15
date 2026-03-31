import { describe, expect, it } from "vitest";

import { resolveStepFacets } from "./facet-loader";
import { loadOperationByName } from "./operation-loader";

describe("operation-definition path-based facet resolution", () => {
  it("loads step facets from markdown files relative to the operation yaml", () => {
    const operation = loadOperationByName("openspec-dev", "ja");
    const planning = operation.steps.find((step) => step.name === "spec-planning");

    expect(planning).toBeTruthy();
    expect(planning?.job_file).toBe("../facets/jobs/planner.md");
    expect(planning?.instruction_file).toBe("../facets/instructions/openspec-planning.md");

    if (!planning) {
      throw new Error("spec-planning step not found");
    }

    const facets = resolveStepFacets(operation, planning, "ja");

    expect(facets.job).toContain("Planner (仕様計画担当)");
    expect(facets.instruction).toContain("Spec Planning — 手順指示");
    expect(facets.outputContracts[0]).toContain("Spec Plan — Output Contract");
  });

  it("loads worker knowledge and policy files from operation-relative paths", () => {
    const operation = loadOperationByName("openspec-dev", "ja");
    const implement = operation.steps.find((step) => step.name === "implement");

    expect(implement).toBeTruthy();
    expect(implement?.knowledge_files).toEqual(["../facets/knowledge/openspec-workflow.md"]);
    expect(implement?.policy_files).toEqual(["../facets/policies/coding-standards.md"]);

    if (!implement) {
      throw new Error("implement step not found");
    }

    const facets = resolveStepFacets(operation, implement, "ja");

    expect(facets.knowledge[0]).toContain("OpenSpec Development Workflow Knowledge");
    expect(facets.policies[0]).toContain("Coding Standards");
  });
});