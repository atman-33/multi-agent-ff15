import type { MissionExecutionTargetMode } from "@/lib/types/mission";

export const DEFAULT_NEW_MISSION_EXECUTION_TARGET_MODE: MissionExecutionTargetMode =
  "execution_project";

export const EXECUTION_MODE_TOGGLE_LABEL = "Dedicated workspace";

export const EXECUTION_MODE_TOOLTIP_COPY =
  "Off: Work directly in the registered project folder. On: Create a mission-specific workspace and work there.";

export function normalizeIncomingMissionExecutionTargetMode(
  value: unknown,
): MissionExecutionTargetMode {
  if (value === "mission_workspace" || value === "execution_project") {
    return value;
  }

  return DEFAULT_NEW_MISSION_EXECUTION_TARGET_MODE;
}

export function normalizeMissionExecutionTargetMode(
  value: string | null | undefined,
  executionProjectId?: string | null,
): MissionExecutionTargetMode | undefined {
  if (value === "mission_workspace" || value === "execution_project") {
    return value;
  }

  return executionProjectId ? "mission_workspace" : undefined;
}

export function getMissionExecutionTargetModeLabel(
  value: MissionExecutionTargetMode | null | undefined,
): string {
  return value === "execution_project" ? "Registered project" : "Dedicated workspace";
}