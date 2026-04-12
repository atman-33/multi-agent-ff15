import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMission, deleteMission } from "@/lib/mission-store";
import { createOperationInstantiator } from "./operation-instantiator";
import { registerDelegatedTask, saveOperationState } from "./state";
import { getOperationState } from "./state";
import type { WorkerAgentId } from "@/lib/types/mission";

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

function createMissionFixture(
  missionId: string,
  options?: { allowedWorkers?: WorkerAgentId[] },
): void {
  missionIds.push(missionId);
  createMission(missionId, `${missionId}-noctis-session`, {
    title: `Mission ${missionId}`,
    allowedWorkers: options?.allowedWorkers,
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

function seedAutonomousBoundaryOperation(root: string): void {
  writeFileSync(
    join(root, "builtins", "ja", "operations", "autonomous-boundary.yaml"),
    [
      "name: autonomous-boundary",
      "description: Operation instantiator delegated return fixture",
      "initial_step: autonomous",
      "steps:",
      "  - name: autonomous",
      "    agent: noctis",
      "    instruction:",
      "      inline: Continue the conversation and delegate when useful.",
      "    delegation:",
      "      allowed_workers:",
      "        - ignis",
      "      worker_job:",
      "        inline: Investigate the current issue.",
      "      worker_instruction:",
      "        inline: Summarize the outcome for Noctis.",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function seedLunafreyaBoundaryOperation(root: string): void {
  writeFileSync(
    join(root, "builtins", "ja", "operations", "lunafreya-autonomous.yaml"),
    [
      "name: lunafreya-autonomous",
      "description: Hidden Lunafreya activation fixture",
      "initial_step: reflect",
      "steps:",
      "  - name: reflect",
      "    agent: lunafreya",
      "    job:",
      "      inline: Lunafreya keeps the conversation focused and calm.",
      "    instruction:",
      "      inline: Respond directly to User.",
      "    knowledge:",
      "      - inline: Selected job and knowledge overlays are already active.",
      "    rules: []",
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
  it("builds an activation prompt for a Lunafreya-owned initial step", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    seedLunafreyaBoundaryOperation(root);
    createMissionFixture("mission-lunafreya-activate");

    const instantiator = createOperationInstantiator();
    const result = instantiator.activateOperation({
      missionId: "mission-lunafreya-activate",
      message: "Start the hidden Lunafreya workflow.",
      selectedOperation: "builtin:ja:lunafreya-autonomous.yaml",
    });

    expect(result.operation?.name).toBe("lunafreya-autonomous");
    expect(result.step?.agent).toBe("lunafreya");
    expect(result.promptArtifact?.mode).toBe("activation");
    expect(result.activationText).toContain("Lunafreya keeps the conversation focused and calm.");
    expect(result.activationText).toContain("Respond directly to User.");
  });

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

  it("returns delegated child reports to the same active Noctis-owned step", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    seedAutonomousBoundaryOperation(root);
    createMissionFixture("mission-delegated", { allowedWorkers: ["ignis"] });

    const instantiator = createOperationInstantiator();
    const activation = instantiator.activateOperation({
      missionId: "mission-delegated",
      message: "Please run autonomous-boundary for this mission.",
    });

    expect(activation.operationState?.currentStep).toBe("autonomous");
    if (!activation.operationState) {
      throw new Error("Expected operationState for delegated return test.");
    }

    registerDelegatedTask(activation.operationState, {
      parentStep: "autonomous",
      taskId: "task-delegated-1",
      agent: "ignis",
      message: "Investigate the current issue and summarize the outcome.",
    });
    saveOperationState("mission-delegated", activation.operationState);

    const result = instantiator.processStepReport({
      missionId: "mission-delegated",
      reportBody: "Collected the needed context for Noctis.",
      fromAgent: "ignis",
      taskId: "task-delegated-1",
      next: "COMPLETE",
    });

    expect(result.stateTransition).toBeNull();
    expect(result.nextWorkerDispatch).toBeNull();
    expect(result.currentStep?.name).toBe("autonomous");
    expect(result.nextStep?.name).toBe("autonomous");
    expect(result.noctisGuidance).toContain('active "autonomous" step');
    expect(result.noctisGuidance).toContain(`${root}/scripts/send_task.sh mission-delegated ignis`);
    expect(result.promptArtifact?.mode).toBe("activation");

    const savedState = getOperationState("mission-delegated");
    expect(savedState?.currentStep).toBe("autonomous");
    expect(savedState?.delegatedTasks[0]).toMatchObject({
      taskId: "task-delegated-1",
      status: "completed",
      summary: "Collected the needed context for Noctis.",
    });
  });

  it("rejects legacy operation state without operationRef", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    seedActivationBoundaryOperation(root);
    createMissionFixture("mission-legacy");

    const instantiator = createOperationInstantiator();
    instantiator.activateOperation({
      missionId: "mission-legacy",
      message: "Please run activation-boundary for this mission.",
    });

    const operationState = getOperationState("mission-legacy");
    const legacyState = {
      ...operationState,
      operationRef: undefined,
    } as unknown as NonNullable<typeof operationState>;

    expect(() =>
      instantiator.processStepReport({
        missionId: "mission-legacy",
        operationState: legacyState,
        reportBody: "Approved.",
        fromAgent: "noctis",
        taskId: operationState?.stepHistory.at(-1)?.taskId ?? "task-legacy",
        next: "implement",
      }),
    ).toThrow(/missing operationRef/i);
  });
});