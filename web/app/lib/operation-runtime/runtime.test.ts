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
        "initial_step: plan",
        "steps:",
        "  - name: plan",
        "    agent: noctis",
        "    job:",
        "      file: ./planner.md",
        "    instruction:",
        "      file: ./plan.md",
        "    rules:",
        "      - condition: Ready to implement",
        "        next: implement",
        "  - name: implement",
        "    agent: gladiolus",
        "    job:",
        "      file: ./implementer.md",
        "    instruction:",
        "      file: ./implement.md",
        "    rules:",
        "      - condition: Implementation complete",
        "        next: review",
        "  - name: review",
        "    agent: ignis",
        "    job:",
        "      file: ./reviewer.md",
        "    instruction:",
        "      file: ./review.md",
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
      missionId: "mission-auto",
      operationState: state,
      reportBody: "Implementation complete.",
      fromAgent: "gladiolus",
      taskId: "task-1",
      next: "review",
    });

    expect(result.stateTransition?.nextStep).toBe("review");
    expect(result.nextWorkerDispatch).toEqual({ step: "review", agentId: "ignis" });
    expect(result.noctisGuidance).toContain("next_step: review");
    expect(result.noctisGuidance).toContain("next_action: dispatch_worker");
    expect(state.currentStep).toBe("review");
  });

  it("prepares the next Noctis self-step when a worker resolves to Noctis", () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    seedOperation(
      root,
      "noctis-transition",
      [
        "name: noctis-transition",
        "description: Noctis transition test",
        "initial_step: plan",
        "steps:",
        "  - name: plan",
        "    agent: noctis",
        "    job:",
        "      file: ./planner.md",
        "    instruction:",
        "      file: ./plan.md",
        "    rules:",
        "      - condition: Ready to implement",
        "        next: implement",
        "  - name: implement",
        "    agent: gladiolus",
        "    job:",
        "      file: ./implementer.md",
        "    instruction:",
        "      file: ./implement.md",
        "    rules:",
        "      - condition: Implementation complete",
        "        next: summarize",
        "  - name: summarize",
        "    agent: noctis",
        "    job:",
        "      file: ./planner.md",
        "    instruction:",
        "      file: ./summary.md",
        "    rules:",
        "      - condition: Reported to user",
        "        next: COMPLETE",
        "",
      ].join("\n"),
    );

    const state = buildDispatchedState({
      operationName: "noctis-transition",
      currentStep: "implement",
      agent: "gladiolus",
      taskId: "task-2",
    });

    const result = processReport({
      missionId: "mission-noctis",
      operationState: state,
      reportBody: "Implementation complete.",
      fromAgent: "gladiolus",
      taskId: "task-2",
      next: "summarize",
    });

    expect(result.stateTransition?.nextStep).toBe("summarize");
    expect(result.nextWorkerDispatch).toBeNull();
    expect(result.noctisGuidance).toContain("next_step: summarize");
    expect(result.noctisGuidance).toContain("next_action: begin_self_step");
    expect(result.noctisGuidance).toContain("scripts/send_report.sh mission-noctis noctis");
    expect(state.currentStep).toBe("summarize");
    expect(state.status).toBe("waiting_for_report");
    expect(state.stepHistory.at(-1)?.step).toBe("summarize");
    expect(state.stepHistory.at(-1)?.taskId).toBeTruthy();
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
        "initial_step: plan",
        "steps:",
        "  - name: plan",
        "    agent: noctis",
        "    job:",
        "      file: ./planner.md",
        "    instruction:",
        "      file: ./plan.md",
        "    rules:",
        "      - condition: Ready to review",
        "        next: review",
        "  - name: review",
        "    agent: ignis",
        "    job:",
        "      file: ./reviewer.md",
        "    instruction:",
        "      file: ./review.md",
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
      missionId: "mission-terminal",
      operationState: state,
      reportBody: "Approved.",
      fromAgent: "ignis",
      taskId: "task-3",
      next: "COMPLETE",
    });

    expect(result.stateTransition?.nextStep).toBe("COMPLETE");
    expect(result.nextWorkerDispatch).toBeNull();
    expect(result.noctisGuidance).toContain("status: complete");
    expect(result.noctisGuidance).toContain("next_action: report_to_user");
  });
});