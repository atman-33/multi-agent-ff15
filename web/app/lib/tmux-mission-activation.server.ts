import { getMission, getMissionPrimarySessionId } from "@/lib/mission-store";
import { listPrimaryAgentOutboxItems } from "@/lib/mission-primary-agent-outbox.server";
import { isSessionStatusActive, type SessionStatus } from "@/lib/session-status";
import { readTmuxActiveMission, writeTmuxActiveMission } from "@/lib/tmux-active-mission.server";
import type { Mission } from "@/lib/types/mission";

type SessionStatusClient = {
  session: {
    status: () => Promise<{ data?: Record<string, unknown>; error?: unknown }>;
  };
};

export interface TmuxMissionWriteConflict {
  activeMissionId: string;
}

function getRelevantMissionSessionIds(mission: Mission): string[] {
  return [
    getMissionPrimarySessionId(mission),
    mission.workerSessions.ignis,
    mission.workerSessions.gladiolus,
    mission.workerSessions.prompto,
  ].filter((sessionId, index, values): sessionId is string => {
    return typeof sessionId === "string" && sessionId.length > 0 && values.indexOf(sessionId) === index;
  });
}

function hasActiveDelegationWork(mission: Mission): boolean {
  if (mission.delegationLedger.activeTasks.length > 0) {
    return true;
  }

  return (
    mission.operationState?.delegatedTasks?.some(
      (task: { status?: string }) => task.status === "dispatched",
    ) ?? false
  );
}

function hasPendingPrimaryOutboxWork(missionId: string): boolean {
  return listPrimaryAgentOutboxItems(missionId).some(
    (item) => item.status === "pending" || item.status === "leased",
  );
}

function coerceStatusesById(result: Record<string, unknown> | undefined, sessionIds: string[]): Record<string, SessionStatus> {
  const statuses: Record<string, SessionStatus> = {};

  for (const sessionId of sessionIds) {
    const value = result?.[sessionId];
    if (value === "idle" || value === "busy" || value === "retry") {
      statuses[sessionId] = value;
      continue;
    }

    if (value && typeof value === "object") {
      const type = (value as { type?: unknown }).type;
      if (type === "idle" || type === "busy" || type === "retry") {
        statuses[sessionId] = type;
      }
    }
  }

  return statuses;
}

export async function getTmuxMissionWriteConflict(input: {
  appRoot: string;
  missionId: string;
  client: SessionStatusClient;
}): Promise<TmuxMissionWriteConflict | null> {
  const activeMission = readTmuxActiveMission(input.appRoot);
  if (!activeMission || activeMission.missionId === input.missionId) {
    return null;
  }

  const mission = getMission(activeMission.missionId);
  if (!mission) {
    return null;
  }

  if (hasPendingPrimaryOutboxWork(mission.id) || hasActiveDelegationWork(mission)) {
    return { activeMissionId: mission.id };
  }

  const relevantSessionIds = getRelevantMissionSessionIds(mission);
  if (relevantSessionIds.length === 0) {
    return null;
  }

  try {
    const result = await input.client.session.status();
    if (result.error) {
      return null;
    }

    const statuses = coerceStatusesById(result.data, relevantSessionIds);
    const hasActiveSession = relevantSessionIds.some((sessionId) =>
      isSessionStatusActive(statuses[sessionId] ?? null),
    );

    return hasActiveSession ? { activeMissionId: mission.id } : null;
  } catch {
    return null;
  }
}

export function activateTmuxMissionWriteFocus(input: { appRoot: string; missionId: string; updatedAt?: string }): void {
  writeTmuxActiveMission(input.appRoot, {
    missionId: input.missionId,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  });
}