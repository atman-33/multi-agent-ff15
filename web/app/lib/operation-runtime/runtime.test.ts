import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createOperationState } from "./state";
import { processReport } from "./runtime";

const tempRoots: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-runtime-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "builtins", "ja", "operations"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  writeFileSync(join(root, "config", "settings.yaml"), "language: ja\n", "utf-8");
  return root;
}

function seedOperation(root: string, name: string, contents: string): void {
  writeFileSync(join(root, "builtins", "ja", "operations", `${name}.yaml`), contents, "utf-8");
}

function buildDispatchedState(input: {
  operationName: string;
  currentStep: string;
  agent: "ignis" | "gladiolus" | "prompto";
  taskId: string;
}) {
  const state = createOperationState(input.operationName, input.currentStep);
  state.currentStep = input.currentStep;
  state.status = "waiting_for_report";
  state.previousResponse = "Synthetic previous step output";
  state.stepHistory = [
    {
      step: input.currentStep,
      agent: input.agent,
      taskId: input.taskId,
      status: "dispatched",
      dispatchedAt: "2026-04-01T00:00:00.000Z",
    },
  ];
  return state;
}

afterEach(() => {
  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("operation runtime", () => {
  it("returns an auto handoff target for worker-to-worker transitions", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    seedOperation(
      root,
      "auto-handoff",
      [
        "name: auto-handoff",
        "description: Auto handoff test",
        "initial_step: implement",
        "handoff_mode: auto",
        "steps:",
        "  - name: implement",
        "    agent: gladiolus",
        "    job_file: ./implementer.md",
        "    instruction_file: ./implement.md",
        "    rules:",
        "      - condition: Implementation complete",
        "        next: review",
        "  - name: review",
        "    agent: ignis",
        "    job_file: ./reviewer.md",
        "    instruction_file: ./review.md",
        "    rules:",
        "      - condition: Approved",
        "        next: COMPLETE",
        "",
      ].join("\n"),
    );

    const state = buildDispatchedState({
      operationName: "auto-handoff",
      currentStep: "implement",
      agent: "gladiolus",
      taskId: "task-1",
    });

    const result = processReport({
      operationState: state,
      reportBody: "Implementation complete.",
      fromAgent: "gladiolus",
      taskId: "task-1",
      reportStatus: "completed",
      ruleIndex: 0,
    });

    expect(result.stateTransition?.nextStep).toBe("review");
    expect(result.nextWorkerDispatch).toEqual({ step: "review", agentId: "ignis" });
    expect(result.noctisGuidance).toContain("next_step: review");
    expect(result.noctisGuidance).toContain("effective_handoff_mode: auto");
    expect(state.currentStep).toBe("review");
  });

  it("keeps manual guidance when the current step overrides handoff_mode", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    seedOperation(
      root,
      "manual-handoff",
      [
        "name: manual-handoff",
        "description: Manual handoff test",
        "initial_step: implement",
        "handoff_mode: auto",
        "steps:",
        "  - name: implement",
        "    agent: gladiolus",
        "    handoff_mode: manual",
        "    job_file: ./implementer.md",
        "    instruction_file: ./implement.md",
        "    rules:",
        "      - condition: Implementation complete",
        "        next: review",
        "  - name: review",
        "    agent: ignis",
        "    job_file: ./reviewer.md",
        "    instruction_file: ./review.md",
        "    rules:",
        "      - condition: Approved",
        "        next: COMPLETE",
        "",
      ].join("\n"),
    );

    const state = buildDispatchedState({
      operationName: "manual-handoff",
      currentStep: "implement",
      agent: "gladiolus",
      taskId: "task-2",
    });

    const result = processReport({
      operationState: state,
      reportBody: "Implementation complete.",
      fromAgent: "gladiolus",
      taskId: "task-2",
      reportStatus: "completed",
      ruleIndex: 0,
    });

    expect(result.stateTransition?.nextStep).toBe("review");
    expect(result.nextWorkerDispatch).toBeNull();
    expect(result.noctisGuidance).toContain("effective_handoff_mode: manual");
    expect(result.noctisGuidance).toContain("next_action: dispatch_worker");
  });

  it("returns terminal guidance without auto dispatch for COMPLETE", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    seedOperation(
      root,
      "terminal-handoff",
      [
        "name: terminal-handoff",
        "description: Terminal handoff test",
        "initial_step: review",
        "handoff_mode: auto",
        "steps:",
        "  - name: review",
        "    agent: ignis",
        "    job_file: ./reviewer.md",
        "    instruction_file: ./review.md",
        "    rules:",
        "      - condition: Approved",
        "        next: COMPLETE",
        "",
      ].join("\n"),
    );

    const state = buildDispatchedState({
      operationName: "terminal-handoff",
      currentStep: "review",
      agent: "ignis",
      taskId: "task-3",
    });

    const result = processReport({
      operationState: state,
      reportBody: "Approved.",
      fromAgent: "ignis",
      taskId: "task-3",
      reportStatus: "completed",
      ruleIndex: 0,
    });

    expect(result.stateTransition?.nextStep).toBe("COMPLETE");
    expect(result.nextWorkerDispatch).toBeNull();
    expect(result.noctisGuidance).toContain("status: complete");
    expect(result.noctisGuidance).toContain("next_action: report_to_user");
  });
});