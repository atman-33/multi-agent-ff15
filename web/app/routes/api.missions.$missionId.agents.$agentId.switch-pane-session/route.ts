import {
  getMission,
  getMissionPrimaryAgentId,
  getMissionPrimarySessionId,
} from "@/lib/mission-store";
import { resolveManagedSessionActivationTitle } from "@/lib/managed-session-activation.server";
import { resolveOwnerEndpointTarget } from "@/lib/session-owner-routing.server";
import { switchTmuxPaneSession } from "@/lib/tmux-pane-session-switch.server";
import type { AgentId, Mission } from "@/lib/types/mission";
import type { Route } from "./+types/route";

const MISSION_AGENT_IDS: ReadonlySet<string> = new Set<AgentId>([
  "noctis",
  "lunafreya",
  "ignis",
  "gladiolus",
  "prompto",
]);

function isMissionAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && MISSION_AGENT_IDS.has(value);
}

function resolveMissionAgentSessionId(mission: Mission, agentId: AgentId): string | null {
  if (agentId === "ignis" || agentId === "gladiolus" || agentId === "prompto") {
    return mission.workerSessions[agentId] ?? null;
  }

  return getMissionPrimaryAgentId(mission) === agentId ? getMissionPrimarySessionId(mission) : null;
}

export const action = async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const missionId = params.missionId;
  const agentId = params.agentId;

  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  if (!isMissionAgentId(agentId)) {
    return Response.json({ error: "Invalid agentId" }, { status: 400 });
  }

  const mission = getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  const sessionId = resolveMissionAgentSessionId(mission, agentId);
  if (!sessionId) {
    return Response.json({ error: "Mission session not found" }, { status: 409 });
  }

  const ownerTarget = resolveOwnerEndpointTarget(agentId, `switch pane session ${missionId}`);

  try {
    const sessionTitle = await resolveManagedSessionActivationTitle({
      client: ownerTarget.client,
      missionId,
      agentId,
      sessionId,
    });

    switchTmuxPaneSession({
      agentId,
      sessionTitle,
    });

    return Response.json({
      ok: true,
      missionId,
      agentId,
      sessionId,
      sessionTitle,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to switch pane session",
      },
      { status: 500 }
    );
  }
};
