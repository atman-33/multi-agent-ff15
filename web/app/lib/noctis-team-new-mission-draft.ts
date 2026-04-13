import {
  DEFAULT_NEW_MISSION_EXECUTION_TARGET_MODE,
  normalizeIncomingMissionExecutionTargetMode,
} from "@/lib/mission-execution-target-mode";
import type { MissionExecutionTargetMode, MissionSurfaceId } from "@/lib/types/mission";

export const NOCTIS_TEAM_NEW_MISSION_DRAFT_STORAGE_KEY = "noctis-team:new-mission-draft:v2";
export const LUNAFREYA_NEW_MISSION_DRAFT_STORAGE_KEY = "lunafreya:new-mission-draft:v2";

export type NoctisTeamNewMissionDraft = {
  executionProjectId: string | null;
  executionTargetMode: MissionExecutionTargetMode;
  contextProjectIds: string[];
};

type ReadStorage = Pick<Storage, "getItem" | "removeItem">;
type WriteStorage = Pick<Storage, "setItem" | "removeItem">;

export function getMissionSurfaceNewMissionDraftStorageKey(surfaceId: MissionSurfaceId): string {
  return surfaceId === "lunafreya"
    ? LUNAFREYA_NEW_MISSION_DRAFT_STORAGE_KEY
    : NOCTIS_TEAM_NEW_MISSION_DRAFT_STORAGE_KEY;
}

export function readMissionSurfaceNewMissionDraft(
  storage: ReadStorage,
  surfaceId: MissionSurfaceId,
): NoctisTeamNewMissionDraft | null {
  const raw = storage.getItem(getMissionSurfaceNewMissionDraftStorageKey(surfaceId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      executionProjectId?: unknown;
      executionTargetMode?: unknown;
      contextProjectIds?: unknown;
    };

    return {
      executionProjectId:
        typeof parsed.executionProjectId === "string" && parsed.executionProjectId.trim().length > 0
          ? parsed.executionProjectId
          : null,
      executionTargetMode: normalizeIncomingMissionExecutionTargetMode(parsed.executionTargetMode),
      contextProjectIds: Array.isArray(parsed.contextProjectIds)
        ? parsed.contextProjectIds.filter(
            (projectId): projectId is string =>
              typeof projectId === "string" && projectId.trim().length > 0,
          )
        : [],
    };
  } catch {
    storage.removeItem(getMissionSurfaceNewMissionDraftStorageKey(surfaceId));
    return null;
  }
}

export function writeMissionSurfaceNewMissionDraft(
  storage: WriteStorage,
  surfaceId: MissionSurfaceId,
  draft: NoctisTeamNewMissionDraft,
): void {
  storage.setItem(getMissionSurfaceNewMissionDraftStorageKey(surfaceId), JSON.stringify(draft));
}

export function clearMissionSurfaceNewMissionDraft(
  storage: Pick<Storage, "removeItem">,
  surfaceId: MissionSurfaceId,
): void {
  storage.removeItem(getMissionSurfaceNewMissionDraftStorageKey(surfaceId));
}

export function readNoctisTeamNewMissionDraft(
  storage: ReadStorage,
): NoctisTeamNewMissionDraft | null {
  return readMissionSurfaceNewMissionDraft(storage, "noctis_team");
}

export function writeNoctisTeamNewMissionDraft(
  storage: WriteStorage,
  draft: NoctisTeamNewMissionDraft,
): void {
  writeMissionSurfaceNewMissionDraft(storage, "noctis_team", draft);
}

export function clearNoctisTeamNewMissionDraft(storage: Pick<Storage, "removeItem">): void {
  clearMissionSurfaceNewMissionDraft(storage, "noctis_team");
}

export function createDefaultNewMissionDraft(
  executionProjectId: string | null,
): NoctisTeamNewMissionDraft {
  return {
    executionProjectId,
    executionTargetMode: DEFAULT_NEW_MISSION_EXECUTION_TARGET_MODE,
    contextProjectIds: [],
  };
}