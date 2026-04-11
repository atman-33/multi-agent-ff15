import { APP_ROOT_EXECUTION_PROJECT_ID } from "@/lib/execution-context";
import { getMission, listMissionSummaries } from "@/lib/mission-store";
import { readSessionExecutionContext, type SessionExecutionContextEntry } from "@/lib/session-execution-context.server";
import { getActivityActorLabel } from "@/lib/team-message-format";
import type { AgentId, ModelSelection } from "@/lib/types/mission";

export interface ManagedSessionInfo {
  assignedModel: ModelSelection | null;
  executionContext: SessionExecutionContextEntry;
  missionId: string;
  missionTitle: string;
  ownerAgent: AgentId;
  ownerLabel: string;
}

function buildManagedSessionInfo(missionId: string, ownerAgent: AgentId): ManagedSessionInfo | null {
  const mission = getMission(missionId);
  if (!mission) {
    return null;
  }

  const executionProjectId = mission.executionProjectId ?? APP_ROOT_EXECUTION_PROJECT_ID;

  return {
    assignedModel: mission.agentModels[ownerAgent] ?? null,
    executionContext: {
      executionProjectId,
      contextProjectIds: mission.contextProjectIds.filter((projectId) => projectId !== executionProjectId),
      updatedAt: mission.updatedAt ?? null,
    },
    missionId,
    missionTitle: mission.title,
    ownerAgent,
    ownerLabel: getActivityActorLabel(ownerAgent),
  };
}

export function listManagedSessions(): Record<string, ManagedSessionInfo> {
  const managedSessions: Record<string, ManagedSessionInfo> = {};

  for (const summary of listMissionSummaries({ view: "all" })) {
    const mission = getMission(summary.missionId);
    if (!mission) {
      continue;
    }

    if (mission.noctisSessionId && !(mission.noctisSessionId in managedSessions)) {
      const info = buildManagedSessionInfo(summary.missionId, "noctis");
      if (info) {
        managedSessions[mission.noctisSessionId] = info;
      }
    }

    for (const ownerAgent of ["ignis", "gladiolus", "prompto"] as const) {
      const sessionId = mission.workerSessions[ownerAgent];
      if (!sessionId || sessionId in managedSessions) {
        continue;
      }

      const info = buildManagedSessionInfo(summary.missionId, ownerAgent);
      if (info) {
        managedSessions[sessionId] = info;
      }
    }
  }

  return managedSessions;
}

export function findManagedSession(sessionId: string): ManagedSessionInfo | null {
  return listManagedSessions()[sessionId] ?? null;
}

export function readEffectiveSessionExecutionContext(sessionId: string): SessionExecutionContextEntry {
  return findManagedSession(sessionId)?.executionContext ?? readSessionExecutionContext(sessionId);
}