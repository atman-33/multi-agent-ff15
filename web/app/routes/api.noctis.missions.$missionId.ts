import { buildMissionResumePayload, missionMatchesSurface } from "@/lib/mission-api.server";
import { replayTmuxDispatchItem } from "@/lib/mission-primary-agent-outbox.server";
import { appendMissionActivity, getMission } from "@/lib/mission-store";
import type { Route } from "./+types/api.noctis.missions.$missionId";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = getMission(missionId);
  if (!mission || !missionMatchesSurface(mission, "noctis_team")) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  return Response.json(buildMissionResumePayload(mission));
};

export const action = async ({ params, request }: Route.ActionArgs) => {
  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = getMission(missionId);
  if (!mission || !missionMatchesSurface(mission, "noctis_team")) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const actionName =
    body && typeof body === "object" && "action" in body ? (body as { action?: unknown }).action : null;
  if (actionName !== "replay_tmux_dispatch") {
    return Response.json({ error: "Unsupported mission action" }, { status: 400 });
  }

  const itemId =
    body && typeof body === "object" && "itemId" in body ? (body as { itemId?: unknown }).itemId : null;
  if (typeof itemId !== "string" || itemId.length === 0) {
    return Response.json({ error: "Missing itemId" }, { status: 400 });
  }

  try {
    const replayedAt = new Date().toISOString();
    const item = replayTmuxDispatchItem({
      missionId,
      itemId,
      replayedAt,
      replayedBy: "mission-route",
    });

    appendMissionActivity(missionId, {
      id: `activity_${crypto.randomUUID()}`,
      actor: "system",
      speaker: "system",
      kind: "system_event",
      body: "Queued exact-replay tmux resend for a failed transport attempt.",
      createdAt: replayedAt,
      source: {
        type: "system",
        sessionId: item.payload.sessionId,
      },
    });

    return Response.json({ ok: true, item });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
};
