import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getProjectRoot } from "@/lib/get-project-root.server";
import { createMission, deleteMission } from "@/lib/mission-store";
import { buildBuiltinOperationRef } from "@/lib/operation-definition/operation-catalog";
import { createOperationState } from "@/lib/operation-runtime/state";
import {
  REVIEW_CYCLE_TEST_OPERATION_NAME,
  writeReviewCycleTestOperation,
} from "@/lib/test-fixtures/operation-fixtures";

vi.mock("@/lib/task-dispatch.server", () => ({
  dispatchCurrentOperationStepToWorker: vi.fn(),
}));

import { dispatchCurrentOperationStepToWorker } from "@/lib/task-dispatch.server";
import { action } from "./route";

const tempRoots: string[] = [];
const missionIds: string[] = [];
const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const repoRoot = getProjectRoot();
const opencodeTemplatePath = join(repoRoot, "config", "opencode.template.json");

function createTempRootWithBuiltins(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-resume-route-"));
  tempRoots.push(root);
  cpSync(join(repoRoot, "scripts"), join(root, "scripts"), { recursive: true });
  cpSync(join(repoRoot, "config"), join(root, "config"), { recursive: true });
  cpSync(join(repoRoot, "builtins"), join(root, "builtins"), { recursive: true });
  cpSync(opencodeTemplatePath, join(root, "opencode.json"));
  writeReviewCycleTestOperation(root);
  return root;
}

function seedMission(input: {
  missionId: string;
  currentStep: string;
  agent: "noctis" | "ignis" | "gladiolus" | "prompto";
  taskId: string;
}) {
  const mission = createMission(input.missionId, `session-${input.missionId}`, {
    title: input.missionId,
    objective: "Test mission",
    allowedWorkers: ["ignis", "gladiolus", "prompto"],
  });
  missionIds.push(input.missionId);

  const state = createOperationState(
    REVIEW_CYCLE_TEST_OPERATION_NAME,
    input.currentStep,
    buildBuiltinOperationRef("ja", `${REVIEW_CYCLE_TEST_OPERATION_NAME}.yaml`),
  );
  state.currentStep = input.currentStep;
  state.status = "waiting_for_report";
  state.stepHistory = [
    {
      step: input.currentStep,
      agent: input.agent,
      taskId: input.taskId,
      status: "dispatched",
      dispatchedAt: "2026-05-01T00:00:00.000Z",
    },
  ];
  mission.operationState = state;
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
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

describe("api.missions.$missionId.resume-active-step", () => {
  it("resumes the active worker step for the matching worker card", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRootWithBuiltins();
    const missionId = `mission-resume-${crypto.randomUUID()}`;
    seedMission({
      missionId,
      currentStep: "implement",
      agent: "gladiolus",
      taskId: "task-implement",
    });
    vi.mocked(dispatchCurrentOperationStepToWorker).mockResolvedValue({
      agentId: "gladiolus",
      stepName: "implement",
      taskId: "task-implement",
      sessionId: "worker-session",
    });

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "gladiolus" }),
      }),
      params: { missionId },
    } as never);

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toMatchObject({
      agentId: "gladiolus",
      stepName: "implement",
      taskId: "task-implement",
      sessionId: "worker-session",
    });
    expect(dispatchCurrentOperationStepToWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId,
        fromAgent: "noctis",
        orchestratedBy: "noctis",
      }),
    );
  });

  it("rejects the request when the selected worker no longer owns the active step", async () => {
    process.env.MULTI_AGENT_FF15_ROOT = createTempRootWithBuiltins();
    const missionId = `mission-stale-${crypto.randomUUID()}`;
    seedMission({
      missionId,
      currentStep: "implement",
      agent: "gladiolus",
      taskId: "task-implement",
    });

    const response = await action({
      request: new Request("http://localhost/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "ignis" }),
      }),
      params: { missionId },
    } as never);

    expect(response.status).toBe(409);
    await expect(readJson(response)).resolves.toMatchObject({
      error: "Active step changed",
      activeAgentId: "gladiolus",
      requestedAgentId: "ignis",
      stepName: "implement",
    });
    expect(dispatchCurrentOperationStepToWorker).not.toHaveBeenCalled();
  });
});