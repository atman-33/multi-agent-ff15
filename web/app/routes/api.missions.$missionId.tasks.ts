import { dispatchTaskToWorker } from "@/lib/task-dispatch.server";
import type { WorkerAgentId } from "@/lib/types/mission";
import type { Route } from "./+types/api.missions.$missionId.tasks";

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
    taskId?: unknown;
    message?: unknown;
    missionObjective?: unknown;
    outputSchema?: unknown;
  } | null;

  if (!body || !isWorkerAgentId(body.agentId)) {
    return Response.json({ error: "Invalid agentId" }, { status: 400 });
  }
  if (typeof body.message !== "string" || !body.message.trim()) {
    return Response.json({ error: "Missing message" }, { status: 400 });
  }

  try {
    const result = await dispatchTaskToWorker({
      missionId,
      agentId: body.agentId,
      taskId: typeof body.taskId === "string" ? body.taskId : undefined,
      message: body.message.trim(),
      missionObjective: typeof body.missionObjective === "string" ? body.missionObjective : undefined,
      outputSchema: typeof body.outputSchema === "string" ? body.outputSchema : undefined,
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to dispatch task";
    const status = message === "Mission not found" ? 404 : 503;
    return Response.json({ error: message }, { status });
  }
};