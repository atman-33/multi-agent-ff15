import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMission, deleteMission } from "@/lib/mission-store";
import { createOperationState, saveOperationState } from "@/lib/operation-runtime/state";
import {
  REVIEW_CYCLE_TEST_OPERATION_NAME,
  REVIEW_CYCLE_TEST_OPERATION_REF,
  writeReviewCycleTestOperation,
} from "@/lib/test-fixtures/operation-fixtures";
import { loader } from "./api.noctis.missions.$missionId";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-mission-route-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "builtins", "ja", "operations"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

function seedWorkflowFixture(root: string): void {
  writeReviewCycleTestOperation(root);
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

afterEach(() => {
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

describe("api.noctis.missions.$missionId", () => {
  it("returns derived workflow progress for the initial mission payload", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    seedWorkflowFixture(root);

    const missionId = `mission-detail-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", {
      title: "Detail mission",
      objective: "Verify workflow progress in initial mission payload",
    });

    const operationState = createOperationState(
      REVIEW_CYCLE_TEST_OPERATION_NAME,
      "spec-planning",
      REVIEW_CYCLE_TEST_OPERATION_REF,
    );
    operationState.currentStep = "review";
    operationState.status = "complete";
    operationState.stepHistory = [
      {
        step: "spec-planning",
        agent: "noctis",
        taskId: "task-spec",
        status: "completed",
        dispatchedAt: "2026-04-11T00:00:00.000Z",
        completedAt: "2026-04-11T00:01:00.000Z",
        nextStep: "implement",
      },
      {
        step: "implement",
        agent: "gladiolus",
        taskId: "task-implement",
        status: "completed",
        dispatchedAt: "2026-04-11T00:02:00.000Z",
        completedAt: "2026-04-11T00:10:00.000Z",
        nextStep: "review",
      },
      {
        step: "review",
        agent: "ignis",
        taskId: "task-review-1",
        status: "completed",
        dispatchedAt: "2026-04-11T00:11:00.000Z",
        completedAt: "2026-04-11T00:12:00.000Z",
        nextStep: "fix",
      },
      {
        step: "fix",
        agent: "gladiolus",
        taskId: "task-fix",
        status: "completed",
        dispatchedAt: "2026-04-11T00:13:00.000Z",
        completedAt: "2026-04-11T00:14:00.000Z",
        nextStep: "review",
      },
      {
        step: "review",
        agent: "ignis",
        taskId: "task-review-2",
        status: "completed",
        dispatchedAt: "2026-04-11T00:15:00.000Z",
        completedAt: "2026-04-11T00:16:00.000Z",
        nextStep: "refactor",
      },
    ];
    saveOperationState(missionId, operationState);

    const response = await loader({ params: { missionId } } as never);
    expect(response.status).toBe(200);

    const data = await readJson<{
      workflowProgress: {
        workflowLabel: string;
        currentStep: string;
        currentStepIndex: number;
        totalSteps: number;
        status: string;
        visitCount: number;
        isTerminal: boolean;
      } | null;
    }>(response);

    expect(data.workflowProgress).toMatchObject({
      workflowLabel: REVIEW_CYCLE_TEST_OPERATION_NAME,
      currentStep: "review",
      currentStepIndex: 3,
      totalSteps: 5,
      status: "complete",
      visitCount: 2,
      isTerminal: true,
    });
  });

  it("keeps read-only mission inspection available when tmux transport is unhealthy", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;
    mkdirSync(join(root, "config"), { recursive: true });
    writeFileSync(
      join(root, "config", "settings.yaml"),
      ['language: ja', 'transport_mode: "tmux-resident"', 'execution_workspace_root: ".worktrees"', ''].join("\n"),
      "utf-8",
    );

    const missionId = `mission-readonly-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-readonly", {
      title: "Readonly mission",
      objective: "Inspect mission details while tmux is unhealthy",
      executionProjectId: "alpha",
      executionTargetMode: "execution_project",
    });

    const response = await loader({ params: { missionId } } as never);
    expect(response.status).toBe(200);

    await expect(readJson<{ missionId: string; transportMode: string | null }>(response)).resolves.toEqual(
      expect.objectContaining({
        missionId,
        transportMode: "tmux-resident",
      }),
    );
  });
});