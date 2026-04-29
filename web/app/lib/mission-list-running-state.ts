import { isSessionStatusActive, type SessionStatus } from "@/lib/session-status";
import type { MissionSummary } from "@/lib/types/mission";

export function isMissionSummaryRunning(
  mission: Pick<MissionSummary, "activitySessionIds" | "agentStatuses">,
  sessionStates: Record<string, SessionStatus | null | undefined>,
): boolean {
  const summaryStatuses = Object.values(mission.agentStatuses ?? {});
  if (summaryStatuses.length > 0) {
    return summaryStatuses.some((status) => isSessionStatusActive(status));
  }

  return mission.activitySessionIds.some((sessionId) =>
    isSessionStatusActive(sessionStates[sessionId] ?? null),
  );
}