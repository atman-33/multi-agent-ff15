import { getMission } from "@/lib/mission-store";
import { buildMissionWorkflowProgress } from "@/lib/mission-workflow-progress.server";
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
    executionProjectId: mission.executionProjectId ?? null,
    executionTargetMode: mission.executionTargetMode ?? null,
    contextProjectIds: mission.contextProjectIds,
    baseBranch: mission.baseBranch ?? null,
    branch: mission.branch ?? null,
    workspacePath: mission.workspacePath ?? null,
    workspaceStatus: mission.workspaceStatus ?? null,
    resumeBlockedReason: mission.executionProjectId
      ? null
      : "Assign an execution project before resuming this legacy mission.",
    sessions: {
      noctis: mission.noctisSessionId || null,
      ignis: mission.workerSessions.ignis ?? null,
      gladiolus: mission.workerSessions.gladiolus ?? null,
      prompto: mission.workerSessions.prompto ?? null,
    },
    agentModels: mission.agentModels,
    delegationLedger: mission.delegationLedger,
    operationState: mission.operationState ?? null,
    workflowProgress: buildMissionWorkflowProgress(mission.operationState),
  });
};
