import { getMission } from "@/lib/mission-store";
import type { Route } from "./+types/api.noctis.missions.$missionId";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  return Response.json({
    missionId: mission.id,
    title: mission.title,
    objective: mission.objective,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    archivedAt: mission.archivedAt ?? null,
    status: mission.status,
    sessions: {
      noctis: mission.noctisSessionId,
      ignis: mission.workerSessions.ignis ?? null,
      gladiolus: mission.workerSessions.gladiolus ?? null,
      prompto: mission.workerSessions.prompto ?? null,
    },
    agentModels: mission.agentModels,
    delegationLedger: mission.delegationLedger,
    messageLog: mission.messageLog,
    activityLog: mission.activityLog,
    operationState: mission.operationState ?? null,
  });
};
