import { sendTeamMessage } from "@/lib/team-message.server";
import type { AgentId, TeamMessageType } from "@/lib/types/mission";
import type { Route } from "./+types/api.missions.$missionId.team-messages";

const AGENTS: ReadonlySet<string> = new Set(["noctis", "ignis", "gladiolus", "prompto"]);
const TYPES: ReadonlySet<string> = new Set([
  "instruction",
  "notify",
  "update",
  "report",
  "handoff",
]);

function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && AGENTS.has(value);
}

function isTeamMessageType(value: unknown): value is TeamMessageType {
  return typeof value === "string" && TYPES.has(value);
}

/**
 * POST /api/missions/{missionId}/team-messages
 * 
 * Sends a team message within a mission.
 * 
 * Semantics per policy:
 * - notify: best-effort one-way notification; no reply expected
 * - report/update: tracked answers, MUST include taskId
 * - instruction/handoff: informational, no taskId required
 */
export const action = async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    fromAgent?: unknown;
    toAgent?: unknown;
    type?: unknown;
    body?: unknown;
    taskId?: unknown;
    artifacts?: unknown;
  } | null;

  if (!body || !isAgentId(body.fromAgent) || !isAgentId(body.toAgent)) {
    return Response.json({ error: "Invalid agents" }, { status: 400 });
  }
  if (!isTeamMessageType(body.type)) {
    return Response.json({ error: "Invalid message type" }, { status: 400 });
  }
  if (typeof body.body !== "string" || !body.body.trim()) {
    return Response.json({ error: "Missing body" }, { status: 400 });
  }

  const taskId = typeof body.taskId === "string" && body.taskId.trim() ? body.taskId.trim() : undefined;
  
  // report/update must include taskId for tracking
  if ((body.type === "report" || body.type === "update") && !taskId) {
    return Response.json({ error: "Report/update messages require taskId" }, { status: 400 });
  }

  try {
    const result = await sendTeamMessage({
      missionId,
      fromAgent: body.fromAgent,
      toAgent: body.toAgent,
      type: body.type,
      body: body.body.trim(),
      taskId,
      artifacts: Array.isArray(body.artifacts)
        ? body.artifacts.filter((item): item is string => typeof item === "string")
        : undefined,
    });

    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to send team message" },
      { status: 500 }
    );
  }
};
