import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMission, deleteMission } from "@/lib/mission-store";
import {
  enqueuePrimaryAgentOutboxItem,
  leaseTmuxDispatchItem,
  markTmuxDispatchItemCancelled,
  markTmuxDispatchItemFailed,
  markTmuxDispatchItemSubmitted,
} from "@/lib/mission-primary-agent-outbox.server";
import { createOperationState, saveOperationState } from "@/lib/operation-runtime/state";
import {
  REVIEW_CYCLE_TEST_OPERATION_NAME,
  REVIEW_CYCLE_TEST_OPERATION_REF,
  writeReviewCycleTestOperation,
} from "@/lib/test-fixtures/operation-fixtures";
import { action, loader } from "./api.noctis.missions.$missionId";

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

  it("returns retained primary-agent outbox artifacts in the mission detail payload", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const missionId = `mission-outbox-detail-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", {
      title: "Outbox detail mission",
      objective: "Inspect retained transport artifacts",
    });

    enqueuePrimaryAgentOutboxItem({
      missionId,
      itemId: "item-detail-1",
      createdAt: "2026-04-28T00:00:00.000Z",
      payload: {
        agent: "noctis",
        sessionId: "session-noctis",
        parts: [{ type: "text", text: "Inspect this queued payload." }],
      },
    });

    const response = await loader({ params: { missionId } } as never);
    expect(response.status).toBe(200);

    await expect(
      readJson<{
        primaryAgentOutbox: Array<{
          id: string;
          payload: { sessionId: string };
          status: string;
        }>;
      }>(response),
    ).resolves.toEqual(
      expect.objectContaining({
        primaryAgentOutbox: [
          expect.objectContaining({
            id: "item-detail-1",
            status: "pending",
            payload: expect.objectContaining({
              sessionId: "session-noctis",
            }),
          }),
        ],
      }),
    );
  });

  it("returns a high-level transport summary alongside retained outbox artifacts", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const missionId = `mission-transport-summary-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", {
      title: "Transport summary mission",
      objective: "Inspect transport summary state",
    });

    enqueuePrimaryAgentOutboxItem({
      missionId,
      itemId: "item-summary-pending",
      createdAt: "2026-04-28T00:00:00.000Z",
      payload: {
        agent: "noctis",
        sessionId: "session-noctis",
        parts: [{ type: "text", text: "pending payload" }],
      },
    });

    enqueuePrimaryAgentOutboxItem({
      missionId,
      itemId: "item-summary-submitted",
      createdAt: "2026-04-28T00:01:00.000Z",
      payload: {
        agent: "noctis",
        sessionId: "session-noctis",
        parts: [{ type: "text", text: "submitted payload" }],
      },
    });
    leaseTmuxDispatchItem({
      missionId,
      leaseOwner: "dispatcher-summary",
      leasedAt: "2026-04-28T00:01:30.000Z",
      staleAfterMs: 30_000,
    });
    markTmuxDispatchItemSubmitted({
      missionId,
      itemId: "item-summary-submitted",
      submittedAt: "2026-04-28T00:02:00.000Z",
      submittedBy: "dispatcher-summary",
    });

    enqueuePrimaryAgentOutboxItem({
      missionId,
      itemId: "item-summary-failed",
      createdAt: "2026-04-28T00:03:00.000Z",
      payload: {
        agent: "noctis",
        sessionId: "session-noctis",
        parts: [{ type: "text", text: "failed payload" }],
      },
    });
    markTmuxDispatchItemFailed({
      missionId,
      itemId: "item-summary-failed",
      failedAt: "2026-04-28T00:03:30.000Z",
      failedBy: "dispatcher-summary",
      reason: "submit failed",
    });

    enqueuePrimaryAgentOutboxItem({
      missionId,
      itemId: "item-summary-cancelled",
      createdAt: "2026-04-28T00:04:00.000Z",
      payload: {
        agent: "noctis",
        sessionId: "session-noctis",
        parts: [{ type: "text", text: "cancelled payload" }],
      },
    });
    markTmuxDispatchItemCancelled({
      missionId,
      itemId: "item-summary-cancelled",
      cancelledAt: "2026-04-28T00:04:30.000Z",
      cancelledBy: "abort-route",
      reason: "Managed session abort requested",
    });

    const response = await loader({ params: { missionId } } as never);
    expect(response.status).toBe(200);

    await expect(
      readJson<{
        transportSummary: {
          blocked: number;
          cancelled: number;
          failed: number;
          pending: number;
          submitted: number;
        };
        primaryAgentOutbox: Array<{ id: string; status: string }>;
      }>(response),
    ).resolves.toEqual(
      expect.objectContaining({
        transportSummary: {
          pending: 1,
          submitted: 1,
          failed: 1,
          cancelled: 1,
          blocked: 1,
        },
        primaryAgentOutbox: [
          expect.objectContaining({ id: "item-summary-pending", status: "pending" }),
          expect.objectContaining({ id: "item-summary-submitted", status: "submitted" }),
          expect.objectContaining({ id: "item-summary-failed", status: "failed" }),
          expect.objectContaining({ id: "item-summary-cancelled", status: "cancelled" }),
        ],
      }),
    );
  });

  it("creates an exact replay attempt for failed tmux dispatch artifacts", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const missionId = `mission-transport-replay-${crypto.randomUUID()}`;
    missionIds.push(missionId);
    createMission(missionId, "session-noctis", {
      title: "Transport replay mission",
      objective: "Replay failed transport artifact",
      executionProjectId: "alpha",
    });

    enqueuePrimaryAgentOutboxItem({
      missionId,
      itemId: "item-replay-source",
      createdAt: "2026-04-28T00:10:00.000Z",
      payload: {
        agent: "noctis",
        sessionId: "session-noctis",
        parts: [{ type: "text", text: "failed replay payload" }],
      },
    });
    markTmuxDispatchItemFailed({
      missionId,
      itemId: "item-replay-source",
      failedAt: "2026-04-28T00:10:30.000Z",
      failedBy: "dispatcher-summary",
      reason: "submit failed",
    });

    const response = await action({
      params: { missionId },
      request: new Request(`http://localhost/api/noctis/missions/${missionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "replay_tmux_dispatch", itemId: "item-replay-source" }),
      }),
    } as never);

    expect(response.status).toBe(200);

    await expect(
      readJson<{
        item: {
          id: string;
          replay: { sourceItemId: string };
          status: string;
        };
        ok: boolean;
      }>(response),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        item: expect.objectContaining({
          status: "pending",
          replay: expect.objectContaining({
            sourceItemId: "item-replay-source",
          }),
        }),
      }),
    );
  });
});