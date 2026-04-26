import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  addTask,
  createMission,
  deleteMission,
  getMission,
  getMissionOutputFilePath,
} from "@/lib/mission-store";
import { buildBuiltinOperationRef } from "@/lib/operation-definition/operation-catalog";
import { createOperationState } from "@/lib/operation-runtime/state";
import {
  REVIEW_CYCLE_TEST_OPERATION_NAME,
  writeReviewCycleTestOperation,
} from "@/lib/test-fixtures/operation-fixtures";

vi.mock("@/lib/team-message.server", () => ({
  sendWorkerReport: vi.fn(),
}));

vi.mock("@/lib/task-dispatch.server", () => ({
  dispatchCurrentOperationStepToWorker: vi.fn(),
}));

import { dispatchCurrentOperationStepToWorker } from "@/lib/task-dispatch.server";
import { sendWorkerReport } from "@/lib/team-message.server";
import { action } from "./route";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const repoRoot = getProjectRoot();

function createTempRootWithBuiltins(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-reports-route-"));
  tempRoots.push(root);
  cpSync(join(repoRoot, "scripts"), join(root, "scripts"), { recursive: true });
  cpSync(join(repoRoot, "config"), join(root, "config"), { recursive: true });
  cpSync(join(repoRoot, "builtins"), join(root, "builtins"), { recursive: true });
  cpSync(join(repoRoot, "opencode.json"), join(root, "opencode.json"));
  writeReviewCycleTestOperation(root);
  return root;
}

function seedMission(input: {
  missionId: string;
  operationName: string;
  currentStep: string;
  agent: "noctis" | "ignis" | "gladiolus" | "prompto";
  taskId: string;
  taskStatus?: "pending" | "running";
}) {
  const mission = createMission(input.missionId, `session-${input.missionId}`, {
    title: input.missionId,
    objective: "Test mission",
    allowedWorkers: ["ignis", "gladiolus", "prompto"],
  });
  missionIds.push(input.missionId);

  if (input.agent !== "noctis") {
    addTask(input.missionId, {
      id: input.taskId,
      assignedTo: input.agent,
      dependencies: [],
      status: input.taskStatus ?? "running",
      message: `Task for ${input.currentStep}`,
    });
  }

  const state = createOperationState(
    input.operationName,
    input.currentStep,
    buildBuiltinOperationRef("ja", `${input.operationName}.yaml`),
  );
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
  mission.operationState = state;

  return mission;
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function writeRequiredOutput(input: {
  missionId: string;
  stepName: string;
  taskId: string;
  filename: string;
  content?: string;
}) {
  const outputPath = getMissionOutputFilePath(
    input.missionId,
    input.stepName,
    input.taskId,
    input.filename,
  );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, input.content ?? "# output\n", "utf-8");
  return outputPath;
}

afterEach(() => {
  vi.clearAllMocks();
  for (const missionId of missionIds.splice(0)) {
    deleteMission(missionId);
  }
  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("api.missions.$missionId.reports", () => {
  it("does not mutate task state when next validation fails", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRootWithBuiltins();
    const missionId = `mission-invalid-${crypto.randomUUID()}`;
    seedMission({
      missionId,
      operationName: REVIEW_CYCLE_TEST_OPERATION_NAME,
      currentStep: "implement",
      agent: "gladiolus",
      taskId: "task-invalid",
      taskStatus: "running",
    });

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAgent: "gladiolus",
          taskId: "task-invalid",
          next: "refactor",
          message: "Implementation complete",
        }),
      }),
      params: { missionId },
    } as never);

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toMatchObject({
      error: "Invalid next",
    });

    const mission = getMission(missionId);
    expect(mission?.taskGraph.find((task) => task.id === "task-invalid")?.status).toBe("running");
    expect(mission?.taskGraph.find((task) => task.id === "task-invalid")?.result).toBeUndefined();
    expect(sendWorkerReport).not.toHaveBeenCalled();
    expect(dispatchCurrentOperationStepToWorker).not.toHaveBeenCalled();
  });

  it("forwards terminal worker reports to Noctis when no auto-dispatch occurs", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRootWithBuiltins();
    const missionId = `mission-progress-${crypto.randomUUID()}`;
    seedMission({
      missionId,
      operationName: REVIEW_CYCLE_TEST_OPERATION_NAME,
      currentStep: "implement",
      agent: "gladiolus",
      taskId: "task-progress",
      taskStatus: "running",
    });
    vi.mocked(sendWorkerReport).mockResolvedValue({ sessionId: "noctis-session", messageId: "msg-1" });

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAgent: "gladiolus",
          taskId: "task-progress",
          next: "ABORT",
          message: "Blocked on a missing prerequisite.",
        }),
      }),
      params: { missionId },
    } as never);

    if (response.status !== 200) {
      throw new Error(JSON.stringify(body));
    }
    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      sessionId: "noctis-session",
      messageId: "msg-1",
    });
    expect(sendWorkerReport).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId,
        taskId: "task-progress",
        next: "ABORT",
        message: "Blocked on a missing prerequisite.",
        reportStatus: "failed",
      }),
    );
    expect(dispatchCurrentOperationStepToWorker).not.toHaveBeenCalled();
  });

  it("rejects reports when a required output file is missing", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRootWithBuiltins();
    const missionId = `mission-missing-output-${crypto.randomUUID()}`;
    seedMission({
      missionId,
      operationName: REVIEW_CYCLE_TEST_OPERATION_NAME,
      currentStep: "review",
      agent: "ignis",
      taskId: "task-review-missing",
      taskStatus: "running",
    });

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAgent: "ignis",
          taskId: "task-review-missing",
          next: "refactor",
          message: "Review is approved.",
        }),
      }),
      params: { missionId },
    } as never);

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toMatchObject({
      error: "Missing required output files",
      missingOutputs: [
        getMissionOutputFilePath(missionId, "review", "task-review-missing", "code-review.md"),
      ],
      retryGuidance:
        `Create the missing output files at the paths above, then rerun the same ${process.env.MULTI_AGENT_FF15_ROOT}/scripts/send_report.sh command.`,
    });

    const mission = getMission(missionId);
    expect(mission?.operationState?.currentStep).toBe("review");
    expect(mission?.taskGraph.find((task) => task.id === "task-review-missing")?.status).toBe(
      "running",
    );
    expect(sendWorkerReport).not.toHaveBeenCalled();
    expect(dispatchCurrentOperationStepToWorker).not.toHaveBeenCalled();
  });

  it("rejects Noctis reports when the spec plan output is missing", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRootWithBuiltins();
    const missionId = `mission-noctis-missing-output-${crypto.randomUUID()}`;
    seedMission({
      missionId,
      operationName: REVIEW_CYCLE_TEST_OPERATION_NAME,
      currentStep: "spec-planning",
      agent: "noctis",
      taskId: "step_spec-planning_1",
    });

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAgent: "noctis",
          taskId: "step_spec-planning_1",
          next: "implement",
          message: "Plan is sufficient to start coding.",
        }),
      }),
      params: { missionId },
    } as never);

    expect(response.status).toBe(400);
    await expect(readJson(response)).resolves.toMatchObject({
      error: "Missing required output files",
      missingOutputs: [
        getMissionOutputFilePath(missionId, "spec-planning", "step_spec-planning_1", "spec-plan.md"),
      ],
      retryGuidance:
        `Create the missing output files at the paths above, then rerun the same ${process.env.MULTI_AGENT_FF15_ROOT}/scripts/send_report.sh command.`,
    });
    expect(dispatchCurrentOperationStepToWorker).not.toHaveBeenCalled();
    expect(sendWorkerReport).not.toHaveBeenCalled();
  });

  it("accepts reports when the required output file exists", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRootWithBuiltins();
    const missionId = `mission-output-present-${crypto.randomUUID()}`;
    seedMission({
      missionId,
      operationName: REVIEW_CYCLE_TEST_OPERATION_NAME,
      currentStep: "review",
      agent: "ignis",
      taskId: "task-review-present",
      taskStatus: "running",
    });
    writeRequiredOutput({
      missionId,
      stepName: "review",
      taskId: "task-review-present",
      filename: "code-review.md",
      content: "# Code Review Report\n\nApproved.\n",
    });
    vi.mocked(dispatchCurrentOperationStepToWorker).mockResolvedValue({
      agentId: "prompto",
      stepName: "refactor",
      taskId: "task-refactor",
      sessionId: "prompto-session",
    });

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAgent: "ignis",
          taskId: "task-review-present",
          next: "refactor",
          message: "Review approved with no blocking issues.",
        }),
      }),
      params: { missionId },
    } as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      dispatchedTo: "prompto",
      nextStep: "refactor",
      taskId: "task-refactor",
      sessionId: "prompto-session",
    });
    expect(dispatchCurrentOperationStepToWorker).toHaveBeenCalledWith({
      missionId,
      fromAgent: "ignis",
      orchestratedBy: "noctis",
      canonicalMessage: "Review approved with no blocking issues.",
    });
  });

  it("accepts manual verification reports when builtin outputs are declared on the step", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRootWithBuiltins();
    const missionId = `mission-manual-verification-${crypto.randomUUID()}`;
    const mission = seedMission({
      missionId,
      operationName: "idea-to-openspec-dev",
      currentStep: "manual-verification",
      agent: "prompto",
      taskId: "step_manual-verification_1",
      taskStatus: "running",
    });
    mission.operationState = {
      ...mission.operationState!,
      currentStep: "manual-verification",
      status: "waiting_for_report",
      stepHistory: [
        {
          step: "spec-planning",
          agent: "noctis",
          taskId: "step_spec-planning_1",
          status: "completed",
          dispatchedAt: "2026-04-01T00:00:00.000Z",
          completedAt: "2026-04-01T00:05:00.000Z",
          ruleMatched: 0,
          ruleCondition: "Spec plan ready",
          nextStep: "implement",
          summary: "Spec plan ready.",
        },
        {
          step: "review",
          agent: "ignis",
          taskId: "step_review_1",
          status: "completed",
          dispatchedAt: "2026-04-01T00:06:00.000Z",
          completedAt: "2026-04-01T00:10:00.000Z",
          ruleMatched: 0,
          ruleCondition: "Approved — no blocking issues",
          nextStep: "manual-verification",
          summary: "Review approved.",
        },
        {
          step: "manual-verification",
          agent: "prompto",
          taskId: "step_manual-verification_1",
          status: "dispatched",
          dispatchedAt: "2026-04-01T00:11:00.000Z",
        },
      ],
    };
    writeRequiredOutput({
      missionId,
      stepName: "spec-planning",
      taskId: "step_spec-planning_1",
      filename: "spec-plan.md",
      content: [
        "---",
        "change_name: block-transferred-month-payroll-changes",
        "change_path: openspec/changes/block-transferred-month-payroll-changes",
        "proposal_path: openspec/changes/block-transferred-month-payroll-changes/proposal.md",
        "design_path: openspec/changes/block-transferred-month-payroll-changes/design.md",
        "tasks_path: openspec/changes/block-transferred-month-payroll-changes/tasks.md",
        "---",
        "",
        "# Spec Plan",
        "",
        "Synthetic spec plan for manual verification transition testing.",
        "",
      ].join("\n"),
    });
    writeRequiredOutput({
      missionId,
      stepName: "review",
      taskId: "step_review_1",
      filename: "code-review.md",
      content: "# Code Review\n\nApproved.\n",
    });
    writeRequiredOutput({
      missionId,
      stepName: "manual-verification",
      taskId: "step_manual-verification_1",
      filename: "manual-verification.md",
      content: "# Manual Verification Guide\n\nReady for User.\n",
    });
    vi.mocked(sendWorkerReport).mockResolvedValue({
      sessionId: "noctis-session",
      messageId: "msg-manual-verification",
    });

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAgent: "prompto",
          taskId: "step_manual-verification_1",
          next: "finalize-delivery",
          message: "Manual verification guide created and ready for delivery.",
        }),
      }),
      params: { missionId },
    } as never);

    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      sessionId: "noctis-session",
      messageId: "msg-manual-verification",
    });
    expect(sendWorkerReport).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId,
        fromAgent: "prompto",
        taskId: "step_manual-verification_1",
        next: "finalize-delivery",
        message: "Manual verification guide created and ready for delivery.",
        reportStatus: "completed",
        artifacts: [],
        workflowGuidance: expect.stringContaining(
          "outputs/manual-verification/step_manual-verification_1/manual-verification.md",
        ),
      }),
    );
    expect(dispatchCurrentOperationStepToWorker).not.toHaveBeenCalled();
    expect(getMission(missionId)?.operationState?.currentStep).toBe("finalize-delivery");
  });

  it("returns delegated child reports to the same Noctis-owned step", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRootWithBuiltins();
    const missionId = `mission-delegated-${crypto.randomUUID()}`;
    const mission = seedMission({
      missionId,
      operationName: "noctis-autonomous",
      currentStep: "autonomous",
      agent: "noctis",
      taskId: "step_autonomous_1",
    });
    mission.operationState?.delegatedTasks.push({
      parentStep: "autonomous",
      taskId: "task-delegated-1",
      agent: "ignis",
      status: "dispatched",
      createdAt: "2026-04-01T00:00:00.000Z",
      message: "Investigate the current issue and summarize the outcome.",
    });
    vi.mocked(sendWorkerReport).mockResolvedValue({
      sessionId: "noctis-session",
      messageId: "msg-delegated",
    });

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAgent: "ignis",
          taskId: "task-delegated-1",
          next: "COMPLETE",
          message: "Collected the needed context for Noctis.",
        }),
      }),
      params: { missionId },
    } as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      sessionId: "noctis-session",
      messageId: "msg-delegated",
    });
    expect(dispatchCurrentOperationStepToWorker).not.toHaveBeenCalled();
    expect(sendWorkerReport).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId,
        fromAgent: "ignis",
        taskId: "task-delegated-1",
        next: "COMPLETE",
        message: "Collected the needed context for Noctis.",
        workflowGuidance: expect.stringContaining("active \"autonomous\" step"),
      }),
    );
    expect(mission.operationState?.currentStep).toBe("autonomous");
    expect(mission.operationState?.delegatedTasks[0]).toMatchObject({
      taskId: "task-delegated-1",
      status: "completed",
      summary: "Collected the needed context for Noctis.",
    });
  });

  it("auto-dispatches the next review-cycle test worker without relaying through Noctis", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRootWithBuiltins();
    const missionId = `mission-auto-${crypto.randomUUID()}`;
    seedMission({
      missionId,
      operationName: REVIEW_CYCLE_TEST_OPERATION_NAME,
      currentStep: "implement",
      agent: "gladiolus",
      taskId: "task-auto",
      taskStatus: "running",
    });
    vi.mocked(dispatchCurrentOperationStepToWorker).mockResolvedValue({
      agentId: "ignis",
      stepName: "review",
      taskId: "task-review",
      sessionId: "ignis-session",
    });

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAgent: "gladiolus",
          taskId: "task-auto",
          next: "review",
          message: "Implementation complete and tests pass",
        }),
      }),
      params: { missionId },
    } as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      dispatchedTo: "ignis",
      nextStep: "review",
      taskId: "task-review",
      sessionId: "ignis-session",
    });

    const mission = getMission(missionId);
    expect(mission?.operationState?.currentStep).toBe("review");
    expect(mission?.taskGraph.find((task) => task.id === "task-auto")?.status).toBe("completed");
    expect(mission?.taskGraph.find((task) => task.id === "task-auto")?.result).toMatchObject({
      next: "review",
      message: "Implementation complete and tests pass",
      reportStatus: "completed",
    });
    expect(dispatchCurrentOperationStepToWorker).toHaveBeenCalledWith({
      missionId,
      fromAgent: "gladiolus",
      orchestratedBy: "noctis",
      canonicalMessage: "Implementation complete and tests pass",
    });
    expect(sendWorkerReport).not.toHaveBeenCalled();
  });

  it("accepts Noctis structured reports and dispatches the next worker step", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRootWithBuiltins();
    const missionId = `mission-noctis-${crypto.randomUUID()}`;
    seedMission({
      missionId,
      operationName: REVIEW_CYCLE_TEST_OPERATION_NAME,
      currentStep: "spec-planning",
      agent: "noctis",
      taskId: "step_spec-planning_1",
    });
    writeRequiredOutput({
      missionId,
      stepName: "spec-planning",
      taskId: "step_spec-planning_1",
      filename: "spec-plan.md",
      content: [
        "---",
        "change_name: reports-route-spec-plan",
        "change_path: openspec/changes/reports-route-spec-plan",
        "proposal_path: openspec/changes/reports-route-spec-plan/proposal.md",
        "design_path: openspec/changes/reports-route-spec-plan/design.md",
        "tasks_path: openspec/changes/reports-route-spec-plan/tasks.md",
        "---",
        "",
        "# Spec Plan",
        "",
        "Synthetic spec plan for route testing.",
        "",
      ].join("\n"),
    });
    vi.mocked(dispatchCurrentOperationStepToWorker).mockResolvedValue({
      agentId: "gladiolus",
      stepName: "implement",
      taskId: "task-implement",
      sessionId: "gladiolus-session",
    });

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAgent: "noctis",
          taskId: "step_spec-planning_1",
          next: "implement",
          message: "Plan is sufficient to start coding.",
        }),
      }),
      params: { missionId },
    } as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      dispatchedTo: "gladiolus",
      nextStep: "implement",
      taskId: "task-implement",
      sessionId: "gladiolus-session",
    });

    const mission = getMission(missionId);
    expect(mission?.operationState?.currentStep).toBe("implement");
    expect(dispatchCurrentOperationStepToWorker).toHaveBeenCalledWith({
      missionId,
      fromAgent: "noctis",
      orchestratedBy: "noctis",
      canonicalMessage: "Plan is sufficient to start coding.",
    });
    expect(sendWorkerReport).not.toHaveBeenCalled();
  });
});
