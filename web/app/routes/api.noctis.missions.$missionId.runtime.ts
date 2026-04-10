import { getMission } from "@/lib/mission-store";
import { getOpencodeClient } from "@/lib/opencode-client";
import { readSessionContextUsage } from "@/lib/session-context.server";
import { coerceSessionStatus } from "@/lib/session-status";
import type { Route } from "./+types/api.noctis.missions.$missionId.runtime";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  const noctisSessionId = mission.noctisSessionId || null;

  try {
    const client = getOpencodeClient();
    const [statusResult, messagesResult] = await Promise.all([
      client.session.status(),
      noctisSessionId
        ? client.session.messages({ sessionID: noctisSessionId })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (statusResult.error) {
      return Response.json({ error: statusResult.error }, { status: 502 });
    }

    if (messagesResult.error) {
      return Response.json({ error: messagesResult.error }, { status: 502 });
    }

    const relevantSessionIds = [
      noctisSessionId,
      mission.workerSessions.ignis,
      mission.workerSessions.gladiolus,
      mission.workerSessions.prompto,
    ].filter(
      (sessionId): sessionId is string => typeof sessionId === "string" && sessionId.length > 0
    );

    const sessionStatuses: Record<string, "idle" | "busy" | "retry"> = {};
    const rawStatuses = statusResult.data ?? {};
    for (const sessionId of relevantSessionIds) {
      const status = coerceSessionStatus(rawStatuses[sessionId]);
      if (status) {
        sessionStatuses[sessionId] = status;
      }
    }

    const contextUsageByAgent = {
      noctis: noctisSessionId ? readSessionContextUsage(noctisSessionId) : null,
      ignis: mission.workerSessions.ignis
        ? readSessionContextUsage(mission.workerSessions.ignis)
        : null,
      gladiolus: mission.workerSessions.gladiolus
        ? readSessionContextUsage(mission.workerSessions.gladiolus)
        : null,
      prompto: mission.workerSessions.prompto
        ? readSessionContextUsage(mission.workerSessions.prompto)
        : null,
    };

    return Response.json({
      missionId: mission.id,
      title: mission.title,
      objective: mission.objective,
      createdAt: mission.createdAt,
      updatedAt: mission.updatedAt,
      status: mission.status,
      executionProjectId: mission.executionProjectId ?? null,
      contextProjectIds: mission.contextProjectIds,
      baseBranch: mission.baseBranch ?? null,
      branch: mission.branch ?? null,
      workspacePath: mission.workspacePath ?? null,
      workspaceStatus: mission.workspaceStatus ?? null,
      resumeBlockedReason: mission.executionProjectId
        ? null
        : "Assign an execution project before resuming this legacy mission.",
      sessions: {
        noctis: noctisSessionId,
        ignis: mission.workerSessions.ignis ?? null,
        gladiolus: mission.workerSessions.gladiolus ?? null,
        prompto: mission.workerSessions.prompto ?? null,
      },
      delegationLedger: mission.delegationLedger,
      messageLog: mission.messageLog,
      operationState: mission.operationState ?? null,
      contextUsageByAgent,
      sessionStatuses,
      noctisMessages: messagesResult.data ?? [],
    });
  } catch {
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
