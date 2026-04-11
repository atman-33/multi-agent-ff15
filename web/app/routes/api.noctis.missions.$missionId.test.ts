import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMission, deleteMission } from "@/lib/mission-store";
import { createOperationState, saveOperationState } from "@/lib/operation-runtime/state";
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
  writeFileSync(
    join(root, "builtins", "ja", "operations", "openspec-dev.yaml"),
    [
      "name: openspec-dev",
      "description: Guided OpenSpec delivery workflow.",
      "initial_step: spec-planning",
      "steps:",
      "  - name: spec-planning",
      "    agent: noctis",
      "    instruction:",
      "      inline: Plan the change.",
      "    rules:",
      "      - condition: Planned",
      "        next: implement",
      "  - name: implement",
      "    agent: gladiolus",
      "    instruction:",
      "      inline: Implement the plan.",
      "    rules:",
      "      - condition: Implemented",
      "        next: review",
      "  - name: review",
      "    agent: ignis",
      "    instruction:",
      "      inline: Review the implementation.",
      "    rules:",
      "      - condition: Approved",
      "        next: refactor",
      "      - condition: Fix needed",
      "        next: fix",
      "  - name: fix",
      "    agent: gladiolus",
      "    instruction:",
      "      inline: Fix review findings.",
      "    rules:",
      "      - condition: Fixed",
      "        next: review",
      "  - name: refactor",
      "    agent: prompto",
      "    instruction:",
      "      inline: Perform final cleanup.",
      "    rules:",
      "      - condition: Done",
      "        next: COMPLETE",
      "",
    ].join("\n"),
    "utf-8",
  );
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
      "openspec-dev",
      "spec-planning",
      "builtin:ja:openspec-dev.yaml",
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
      workflowLabel: "openspec-dev",
      currentStep: "review",
      currentStepIndex: 3,
      totalSteps: 5,
      status: "complete",
      visitCount: 2,
      isTerminal: true,
    });
  });
});