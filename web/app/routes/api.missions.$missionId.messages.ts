import { sendSimpleMessage } from "@/lib/team-message.server";
import type { WorkerAgentId } from "@/lib/types/mission";
import type { Route } from "./+types/api.missions.$missionId.messages";

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
    toAgent?: unknown;
    body?: unknown;
  } | null;

  if (!body || !isWorkerAgentId(body.toAgent)) {
    return Response.json({ error: "Invalid toAgent" }, { status: 400 });
  }
  if (typeof body.body !== "string" || !body.body.trim()) {
    return Response.json({ error: "Missing body" }, { status: 400 });
  }

  try {
    const result = await sendSimpleMessage({
      missionId,
      toAgent: body.toAgent,
      body: body.body.trim(),
      fromActor: "user",
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send message";
    const status = message === "Mission not found" ? 404 : 503;
    return Response.json({ error: message }, { status });
  }
};
