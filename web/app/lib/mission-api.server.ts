import { buildMissionBanterTimeline } from "@/lib/banter/timeline";
import { getOpencodeClient } from "@/lib/opencode-client";
import { readSessionContextUsage } from "@/lib/session-context.server";
import type { SessionStatus } from "@/lib/session-status";
import { coerceSessionStatus } from "@/lib/session-status";
import type {
  AgentContextUsage,
  AgentId,
  Mission,
  MissionSurfaceId,
} from "@/lib/types/mission";
import {
  getMissionPrimaryAgentId,
  getMissionPrimarySessionId,
  getMissionSurfaceId,
} from "./mission-store";
import { getMissionSurfaceForMission } from "./mission-surface";
import { buildMissionWorkflowProgress } from "./mission-workflow-progress.server";

type MissionSessionPayload = {
  primary: string | null;
  noctis: string | null;
  ignis: string | null;
  gladiolus: string | null;
  prompto: string | null;
};

function buildContextUsageByAgent(
  mission: Mission,
  primaryAgentId: AgentId,
  primarySessionId: string | null,
): Record<AgentId, AgentContextUsage | null> {
  return {
    noctis:
      primaryAgentId === "noctis" && primarySessionId
        ? readSessionContextUsage(primarySessionId)
        : null,
    lunafreya:
      primaryAgentId === "lunafreya" && primarySessionId
        ? readSessionContextUsage(primarySessionId)
        : null,
    ignis: mission.workerSessions.ignis ? readSessionContextUsage(mission.workerSessions.ignis) : null,
    gladiolus: mission.workerSessions.gladiolus
      ? readSessionContextUsage(mission.workerSessions.gladiolus)
      : null,
    prompto: mission.workerSessions.prompto
      ? readSessionContextUsage(mission.workerSessions.prompto)
      : null,
  };
}

export function missionMatchesSurface(mission: Mission, surfaceId: MissionSurfaceId): boolean {
  return getMissionSurfaceId(mission) === surfaceId;
}

export function buildMissionSessionsPayload(mission: Mission): MissionSessionPayload {
  return {
    primary: getMissionPrimarySessionId(mission),
    noctis: mission.noctisSessionId || null,
    ignis: mission.workerSessions.ignis ?? null,
    gladiolus: mission.workerSessions.gladiolus ?? null,
    prompto: mission.workerSessions.prompto ?? null,
  };
}

export function buildMissionResumePayload(mission: Mission) {
  const primaryAgentId = getMissionPrimaryAgentId(mission);
  const primarySessionId = getMissionPrimarySessionId(mission);

  return {
    missionId: mission.id,
    surfaceId: getMissionSurfaceId(mission),
    primaryAgentId,
    primarySessionId,
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
    sessions: buildMissionSessionsPayload(mission),
    agentModels: mission.agentModels,
    delegationLedger: mission.delegationLedger,
    operationState: mission.operationState ?? null,
    workflowProgress: buildMissionWorkflowProgress(mission.operationState),
    lunafreyaFacetSelection: mission.lunafreyaFacetSelection ?? null,
    activityLog: mission.activityLog,
  };
}

export async function buildMissionRuntimePayload(mission: Mission) {
  const primaryAgentId = getMissionPrimaryAgentId(mission);
  const primarySessionId = getMissionPrimarySessionId(mission);
  const surface = getMissionSurfaceForMission(mission);
  const client = getOpencodeClient();
  const [statusResult, messagesResult] = await Promise.all([
    client.session.status(),
    primarySessionId
      ? client.session.messages({ sessionID: primarySessionId })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (statusResult.error) {
    throw new Error(String(statusResult.error));
  }

  if (messagesResult.error) {
    throw new Error(String(messagesResult.error));
  }

  const relevantSessionIds = [
    primarySessionId,
    mission.workerSessions.ignis,
    mission.workerSessions.gladiolus,
    mission.workerSessions.prompto,
  ].filter((sessionId, index, values): sessionId is string => {
    return (
      typeof sessionId === "string" && sessionId.length > 0 && values.indexOf(sessionId) === index
    );
  });

  const sessionStatuses: Record<string, SessionStatus> = {};
  const rawStatuses = statusResult.data ?? {};
  for (const sessionId of relevantSessionIds) {
    const status = coerceSessionStatus(rawStatuses[sessionId]);
    if (status) {
      sessionStatuses[sessionId] = status;
    }
  }

  return {
    ...buildMissionResumePayload(mission),
    banterTimeline: surface.supportsBanter ? buildMissionBanterTimeline(mission) : [],
    contextUsageByAgent: buildContextUsageByAgent(mission, primaryAgentId ?? "noctis", primarySessionId),
    sessionStatuses,
    primaryMessages: messagesResult.data ?? [],
    noctisMessages: primaryAgentId === "noctis" ? (messagesResult.data ?? []) : [],
  };
}