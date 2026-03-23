import { archiveMission, getMission, restoreMission } from "@/lib/mission-store";
import type { Route } from "./+types/api.noctis.missions.$missionId.archive";

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
  const archiveAction = body?.action;
  if (archiveAction !== "archive" && archiveAction !== "restore") {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }

  const updatedMission =
    archiveAction === "archive" ? archiveMission(missionId) : restoreMission(missionId);

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
      archivedAt: updatedMission.archivedAt ?? null,
      status: updatedMission.status,
    },
  });
};