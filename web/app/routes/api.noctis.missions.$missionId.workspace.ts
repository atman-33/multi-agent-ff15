import { coerceSessionStatus } from "@/lib/session-status";
import { getOpencodeClient } from "@/lib/opencode-client";
import {
  deleteMissionExecutionWorkspace,
} from "@/lib/mission-execution-workspace.server";
import {
  clearMissionSessions,
  getMission,
  updateMissionExecutionContext,
} from "@/lib/mission-store";
import type { Route } from "./+types/api.noctis.missions.$missionId.workspace";

export const action = async ({ params, request }: Route.ActionArgs) => {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }
  if (!mission.workspacePath) {
    return Response.json({ error: "Mission has no execution workspace." }, { status: 409 });
  }

  try {
    const statusResult = await getOpencodeClient().session.status();
    if (statusResult.error) {
      return Response.json({ error: statusResult.error }, { status: 502 });
    }

    const relevantSessionIds = [
      mission.noctisSessionId,
      mission.workerSessions.ignis,
      mission.workerSessions.gladiolus,
      mission.workerSessions.prompto,
    ].filter((sessionId): sessionId is string => typeof sessionId === "string" && sessionId.length > 0);

    const rawStatuses = statusResult.data ?? {};
    const hasActiveSession = relevantSessionIds.some((sessionId) => {
      const status = coerceSessionStatus(rawStatuses[sessionId]);
      return status === "busy" || status === "retry";
    });
    const hasRunningOperation =
      mission.operationState?.status === "running" ||
      mission.operationState?.status === "waiting_for_report";

    deleteMissionExecutionWorkspace({
      isRunning: hasActiveSession || hasRunningOperation,
      workspacePath: mission.workspacePath,
    });

    clearMissionSessions(missionId);
    updateMissionExecutionContext(missionId, { workspaceStatus: "deleted" });

    return Response.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message.length > 0) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};