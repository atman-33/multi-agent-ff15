import { getMission, updateMissionMetadata } from "@/lib/mission-store";
import type { Route } from "./+types/api.noctis.missions.$missionId.rename";

export const action = async ({ params, request }: Route.ActionArgs) => {
  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!title) {
    return Response.json({ error: "Missing title" }, { status: 400 });
  }

  updateMissionMetadata(missionId, { title });

  const updatedMission = getMission(missionId);
  if (!updatedMission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  return Response.json({
    mission: {
      missionId: updatedMission.id,
      title: updatedMission.title,
      objective: updatedMission.objective,
      createdAt: updatedMission.createdAt,
      updatedAt: updatedMission.updatedAt,
      status: updatedMission.status,
    },
  });
};