import type { MissionExecutionTargetMode } from "@/lib/types/mission";

export const NOCTIS_TEAM_NEW_MISSION_DRAFT_STORAGE_KEY = "noctis-team:new-mission-draft";

export type NoctisTeamNewMissionDraft = {
  executionProjectId: string | null;
  executionTargetMode: MissionExecutionTargetMode;
  contextProjectIds: string[];
};

type ReadStorage = Pick<Storage, "getItem" | "removeItem">;
type WriteStorage = Pick<Storage, "setItem" | "removeItem">;

export function readNoctisTeamNewMissionDraft(
  storage: ReadStorage,
): NoctisTeamNewMissionDraft | null {
  const raw = storage.getItem(NOCTIS_TEAM_NEW_MISSION_DRAFT_STORAGE_KEY);
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
      executionTargetMode:
        parsed.executionTargetMode === "execution_project"
          ? "execution_project"
          : "mission_workspace",
      contextProjectIds: Array.isArray(parsed.contextProjectIds)
        ? parsed.contextProjectIds.filter(
            (projectId): projectId is string =>
              typeof projectId === "string" && projectId.trim().length > 0,
          )
        : [],
    };
  } catch {
    storage.removeItem(NOCTIS_TEAM_NEW_MISSION_DRAFT_STORAGE_KEY);
    return null;
  }
}

export function writeNoctisTeamNewMissionDraft(
  storage: WriteStorage,
  draft: NoctisTeamNewMissionDraft,
): void {
  storage.setItem(NOCTIS_TEAM_NEW_MISSION_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function clearNoctisTeamNewMissionDraft(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(NOCTIS_TEAM_NEW_MISSION_DRAFT_STORAGE_KEY);
}