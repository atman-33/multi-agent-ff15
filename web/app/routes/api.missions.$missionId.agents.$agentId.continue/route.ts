import {
  getMission,
  getMissionPrimaryAgentId,
  getMissionPrimarySessionId,
} from "@/lib/mission-store";
import { resolveManagedSessionActivationTitle } from "@/lib/managed-session-activation.server";
import { splitModelSelection } from "@/lib/model-variant-selection";
import { getOpencodeClient } from "@/lib/opencode-client";
import { queueTmuxAgentDispatch } from "@/lib/primary-agent-outbox-dispatch.server";
import { resolveOwnerEndpointTarget } from "@/lib/session-owner-routing.server";
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

  const promptParts = [{ type: "text" as const, text: "continue" }];
  const { model, variant } = splitModelSelection(mission.agentModels[agentId]);

  if (mission.transportMode === "tmux-resident") {
    const ownerTarget = resolveOwnerEndpointTarget(agentId, `raw continue ${missionId}`);
    const sessionTitle = await resolveManagedSessionActivationTitle({
      client: ownerTarget.client,
      missionId,
      agentId,
      sessionId,
    });

    queueTmuxAgentDispatch({
      activityBody: "Queued raw continue delivery.",
      agent: agentId,
      missionId,
      ...(model ? { model } : {}),
      parts: promptParts,
      sessionId,
      sessionTitle,
      ...(variant ? { variant } : {}),
    });

    return Response.json({
      ok: true,
      missionId,
      agentId,
      sessionId,
    });
  }

  const result = await getOpencodeClient().session.promptAsync({
    sessionID: sessionId,
    parts: promptParts,
    agent: agentId,
    ...(model ? { model } : {}),
    ...(variant ? { variant } : {}),
  });

  if (result.error) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  return Response.json({
    ok: true,
    missionId,
    agentId,
    sessionId,
  });
};