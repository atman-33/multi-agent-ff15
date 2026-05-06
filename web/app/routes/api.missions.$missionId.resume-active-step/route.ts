import { getMission } from "@/lib/mission-store";
import { loadOperationByRef } from "@/lib/operation-definition/operation-catalog";
import {
  getActiveStepRecord,
  getOperationRef,
  getOperationState,
} from "@/lib/operation-runtime/state";
import { dispatchCurrentOperationStepToWorker } from "@/lib/task-dispatch.server";
import type { WorkerAgentId } from "@/lib/types/mission";
import type { Route } from "./+types/route";

const WORKER_AGENT_IDS: ReadonlySet<string> = new Set<WorkerAgentId>([
  "ignis",
  "gladiolus",
  "prompto",
]);

function isWorkerAgentId(value: unknown): value is WorkerAgentId {
  return typeof value === "string" && WORKER_AGENT_IDS.has(value);
}

export const action = async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    agentId?: unknown;
  } | null;

  if (!body || !isWorkerAgentId(body.agentId)) {
    return Response.json({ error: "Invalid agentId" }, { status: 400 });
  }

  if (!getMission(missionId)) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  const operationState = getOperationState(missionId);
  if (!operationState) {
    return Response.json({ error: "No active worker step" }, { status: 409 });
  }

  const operation = loadOperationByRef(getOperationRef(operationState));
  const currentStep = operation.steps.find((step) => step.name === operationState.currentStep) ?? null;
  const activeRecord = getActiveStepRecord(operationState) ?? null;

  if (
    !currentStep ||
    !isWorkerAgentId(currentStep.agent) ||
    !activeRecord ||
    activeRecord.agent !== currentStep.agent ||
    activeRecord.step !== currentStep.name ||
    !activeRecord.taskId
  ) {
    return Response.json({ error: "No active worker step" }, { status: 409 });
  }

  if (body.agentId !== currentStep.agent) {
    return Response.json(
      {
        error: "Active step changed",
        activeAgentId: currentStep.agent,
        requestedAgentId: body.agentId,
        stepName: currentStep.name,
      },
      { status: 409 },
    );
  }

  try {
    const result = await dispatchCurrentOperationStepToWorker({
      missionId,
      fromAgent: "noctis",
      orchestratedBy: "noctis",
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resume active worker step";
    const status = message === "Mission not found" ? 404 : 503;
    return Response.json({ error: message }, { status });
  }
};