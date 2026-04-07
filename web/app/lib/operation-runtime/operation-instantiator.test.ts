import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMission, deleteMission } from "@/lib/mission-store";
import { createOperationInstantiator } from "./operation-instantiator";
import { getOperationState } from "./state";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-instantiator-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "builtins", "ja", "operations"), { recursive: true });
  mkdirSync(join(root, "builtins", "ja", "facets", "knowledge"), { recursive: true });
  mkdirSync(join(root, "builtins", "ja", "facets", "policies"), { recursive: true });
  mkdirSync(join(root, "builtins", "ja", "facets", "output-contracts"), {
    recursive: true,
  });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  writeFileSync(join(root, "config", "settings.yaml"), "language: ja\n", "utf-8");
  return root;
}

function createMissionFixture(missionId: string): void {
  missionIds.push(missionId);
  createMission(missionId, `${missionId}-noctis-session`, {
    title: `Mission ${missionId}`,
  });
}

function seedActivationBoundaryOperation(root: string): void {
  writeFileSync(
    join(root, "builtins", "ja", "operations", "activation-boundary.yaml"),
    [
      "name: activation-boundary",
      "description: Operation instantiator activation fixture",
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    job:",
      "      file: ./plan-job.md",
      "    instruction:",
      "      file: ./plan-instruction.md",
      "    knowledge:",
      "      - file: ../facets/knowledge/runtime-contract.md",
      "    policies:",
      "      - file: ../facets/policies/noctis-policy.md",
      "    output_contracts:",
      "      report:",
      "        - name: plan-output.md",
      "          format:",
      "            file: ../facets/output-contracts/plan-output.md",
      "    rules:",
      "      - condition: Plan approved",
      "        next: implement",
      "  - name: implement",
      "    agent: gladiolus",
      "    instruction:",
      "      inline: Implement the approved plan.",
      "    rules:",
      "      - condition: Implementation complete",
      "        next: COMPLETE",
      "",
    ].join("\n"),
    "utf-8",
  );

  writeFileSync(
    join(root, "builtins", "ja", "operations", "plan-job.md"),
    "# Planner role\n\nPlanner role for the activation step.\n",
    "utf-8",
  );
  writeFileSync(
    join(root, "builtins", "ja", "operations", "plan-instruction.md"),
    "# Plan instruction\n\nOutline the next implementation tasks.\n",
    "utf-8",
  );
  writeFileSync(
    join(root, "builtins", "ja", "facets", "knowledge", "runtime-contract.md"),
    [
      "---",
      "name: runtime-contract",
      "description: Read when preparing the activation handoff.",
      "critical:",
      "  - Runtime decides the next actor.",
      "---",
      "# Runtime contract",
      "",
      "The full body should not be injected into the prompt.",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(root, "builtins", "ja", "facets", "policies", "noctis-policy.md"),
    "# Policy\n\nAlways respond with YAML status updates.\n",
    "utf-8",
  );
  writeFileSync(
    join(root, "builtins", "ja", "facets", "output-contracts", "plan-output.md"),
    [
      "# Plan output contract",
      "",
      "## Format",
      "Provide a concise implementation plan.",
      "",
      "## Rule",
      "Create the output before reporting completion.",
      "",
    ].join("\n"),
    "utf-8",
  );
}

afterEach(() => {
  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }

  while (missionIds.length > 0) {
    const missionId = missionIds.pop();
    if (missionId) {
      deleteMission(missionId);
    }
  }

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("OperationInstantiator", () => {
  it("activates a detected operation and returns resolved prompt metadata", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    seedActivationBoundaryOperation(root);
    createMissionFixture("mission-activate");

    const instantiator = createOperationInstantiator();
    const result = instantiator.activateOperation({
      missionId: "mission-activate",
      message: "Please run activation-boundary for this mission.",
    });

    expect(result.operation?.name).toBe("activation-boundary");
    expect(result.operationState?.currentStep).toBe("plan");
    expect(result.step?.name).toBe("plan");
    expect(result.activationText).toContain("Planner role for the activation step.");
    expect(result.activationText).toContain("runtime-contract");
    expect(result.activationText).toContain("Always respond with YAML status updates.");
    expect(result.activationText).toContain("Plan output contract");
    expect(result.promptArtifact?.mode).toBe("activation");
    expect(result.promptArtifact?.facets.knowledge).toHaveLength(1);
    expect(result.promptArtifact?.facets.policies).toEqual([
      "# Policy\n\nAlways respond with YAML status updates.\n",
    ]);

    const savedState = getOperationState("mission-activate");
    expect(savedState?.operationName).toBe("activation-boundary");
    expect(savedState?.operationRef).toBe("builtin:ja:activation-boundary.yaml");
  });

  it("advances the active step and returns the next worker dispatch", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    seedActivationBoundaryOperation(root);
    createMissionFixture("mission-report");

    const instantiator = createOperationInstantiator();
    instantiator.activateOperation({
      missionId: "mission-report",
      message: "Please run activation-boundary for this mission.",
    });

    const activationState = getOperationState("mission-report");
    const taskId = activationState?.stepHistory.at(-1)?.taskId;

    expect(taskId).toBeTruthy();

    const result = instantiator.processStepReport({
      missionId: "mission-report",
      reportBody: "Plan approved and ready for implementation.",
      fromAgent: "noctis",
      taskId: taskId ?? "",
      next: "implement",
    });

    expect(result.stateTransition?.nextStep).toBe("implement");
    expect(result.nextWorkerDispatch).toEqual({
      step: "implement",
      agentId: "gladiolus",
    });
    expect(result.noctisGuidance).toContain("next_step: implement");
    expect(result.noctisGuidance).toContain("next_action: dispatch_worker");
    expect(result.nextStep?.name).toBe("implement");

    const savedState = getOperationState("mission-report");
    expect(savedState?.currentStep).toBe("implement");
    expect(savedState?.status).toBe("running");
  });

  it("augments the active worker prompt and appends a deviation note for a different agent", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    seedActivationBoundaryOperation(root);
    createMissionFixture("mission-augment");

    const instantiator = createOperationInstantiator();
    instantiator.activateOperation({
      missionId: "mission-augment",
      message: "Please run activation-boundary for this mission.",
    });

    const activationState = getOperationState("mission-augment");
    const activationTaskId = activationState?.stepHistory.at(-1)?.taskId;

    expect(activationTaskId).toBeTruthy();

    instantiator.processStepReport({
      missionId: "mission-augment",
      reportBody: "Plan approved and ready for implementation.",
      fromAgent: "noctis",
      taskId: activationTaskId ?? "",
      next: "implement",
    });

    const result = instantiator.augmentTaskPrompt({
      missionId: "mission-augment",
      originalPrompt: "Base task prompt.",
      agentId: "prompto",
      taskId: "task-augment-1",
    });

    expect(result.step?.name).toBe("implement");
    expect(result.promptText).toContain("Implement the approved plan.");
    expect(result.promptText).toContain("Plan approved and ready for implementation.");
    expect(result.promptText).toContain('Expected agent "gladiolus" but dispatched to "prompto".');
    expect(result.promptArtifact?.mode).toBe("worker");

    const savedState = getOperationState("mission-augment");
    expect(savedState?.deviations.totalDeviations).toBe(1);
  });
});