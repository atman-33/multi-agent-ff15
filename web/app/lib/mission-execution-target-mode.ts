import type { MissionExecutionTargetMode } from "@/lib/types/mission";

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
  return value === "execution_project" ? "Execution project direct" : "Mission workspace";
}