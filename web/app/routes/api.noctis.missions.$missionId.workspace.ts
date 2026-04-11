import { getOpencodeClient } from "@/lib/opencode-client";
import { saveOperationState } from "@/lib/operation-runtime/state";
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

  const relevantSessionIds = [
    mission.noctisSessionId,
    mission.workerSessions.ignis,
    mission.workerSessions.gladiolus,
    mission.workerSessions.prompto,
  ].filter((sessionId): sessionId is string => typeof sessionId === "string" && sessionId.length > 0);

  try {
    if (relevantSessionIds.length > 0) {
      try {
        const client = getOpencodeClient();
        await Promise.allSettled(
          relevantSessionIds.map(async (sessionId) => {
            const result = await client.session.abort({ sessionID: sessionId });
            if (result.error) {
              throw new Error(String(result.error));
            }
          }),
        );
      } catch {
        // Best effort only. User-confirmed workspace deletion must still proceed.
      }
    }

    if (
      mission.operationState &&
      (mission.operationState.status === "running" ||
        mission.operationState.status === "waiting_for_report")
    ) {
      saveOperationState(missionId, {
        ...mission.operationState,
        status: "aborted",
      });
    }

    deleteMissionExecutionWorkspace({
      workspacePath: mission.workspacePath,
      force: true,
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