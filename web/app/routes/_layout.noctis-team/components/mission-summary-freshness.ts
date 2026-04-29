import type { MissionSummary } from "@/lib/types/mission";

function getFreshnessKey(mission: MissionSummary): string {
  return `${mission.latestPrimaryMessageId ?? ""}:${mission.latestPrimaryMessageCreatedAt ?? ""}`;
}

export function reconcileFreshMissionIds(input: {
  currentFreshMissionIds: string[];
  previousMissions: MissionSummary[];
  nextMissions: MissionSummary[];
  activeMissionId: string | null;
}): string[] {
  const { activeMissionId, currentFreshMissionIds, nextMissions, previousMissions } = input;
  const nextMissionIds = new Set(nextMissions.map((mission) => mission.missionId));
  const previousMissionById = new Map(
    previousMissions.map((mission) => [mission.missionId, mission] as const),
  );
  const nextFreshMissionIds = new Set(
    currentFreshMissionIds.filter(
      (missionId) => missionId !== activeMissionId && nextMissionIds.has(missionId),
    ),
  );

  for (const mission of nextMissions) {
    if (mission.missionId === activeMissionId) {
      continue;
    }

    const previousMission = previousMissionById.get(mission.missionId);
    if (!previousMission) {
      continue;
    }

    if (getFreshnessKey(previousMission) !== getFreshnessKey(mission)) {
      nextFreshMissionIds.add(mission.missionId);
    }
  }

  return Array.from(nextFreshMissionIds);
}