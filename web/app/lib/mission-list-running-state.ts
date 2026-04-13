import { isSessionStatusActive, type SessionStatus } from "@/lib/session-status";
import type { MissionSummary } from "@/lib/types/mission";

export function isMissionSummaryRunning(
  mission: Pick<MissionSummary, "activitySessionIds">,
  sessionStates: Record<string, SessionStatus | null | undefined>,
): boolean {
  return mission.activitySessionIds.some((sessionId) =>
    isSessionStatusActive(sessionStates[sessionId] ?? null),
  );
}