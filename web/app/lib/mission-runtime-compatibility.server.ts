import { readAppConfig } from "@/lib/app-config.server";
import { getProjectRoot } from "@/lib/get-project-root.server";
import type { Mission, MissionResumeBlockCode, MissionTransportMode } from "@/lib/types/mission";

export const CURRENT_MISSION_SCHEMA_VERSION = 1;

export const LEGACY_EXECUTION_PROJECT_MESSAGE =
  "Assign an execution project before resuming this legacy mission.";

export const UNSUPPORTED_MISSION_RUNTIME_MESSAGE =
  "Mission uses an unsupported runtime format and can no longer be resumed.";

type MissionResumeBlock = {
  code: MissionResumeBlockCode;
  message: string;
};

export function normalizeMissionTransportMode(value: unknown): MissionTransportMode | undefined {
  return value === "app-owned" || value === "tmux-resident" ? value : undefined;
}

export function normalizeMissionSchemaVersion(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

export function getConfiguredMissionTransportMode(): MissionTransportMode {
  return readAppConfig(getProjectRoot()).transportMode;
}

export function buildCurrentMissionRuntimeMetadata(): Pick<Mission, "schemaVersion" | "transportMode"> {
  return {
    schemaVersion: CURRENT_MISSION_SCHEMA_VERSION,
    transportMode: getConfiguredMissionTransportMode(),
  };
}

export function getMissionCompatibilityIssue(mission: Mission): MissionResumeBlock | null {
  const schemaVersion = normalizeMissionSchemaVersion(mission.schemaVersion);
  if (schemaVersion !== CURRENT_MISSION_SCHEMA_VERSION) {
    return {
      code: "unsupported_mission_runtime",
      message: UNSUPPORTED_MISSION_RUNTIME_MESSAGE,
    };
  }

  return null;
}

export function getMissionResumeBlock(mission: Mission): MissionResumeBlock | null {
  const compatibilityIssue = getMissionCompatibilityIssue(mission);
  if (compatibilityIssue) {
    return compatibilityIssue;
  }

  if (!mission.executionProjectId) {
    return {
      code: "missing_execution_project",
      message: LEGACY_EXECUTION_PROJECT_MESSAGE,
    };
  }

  return null;
}