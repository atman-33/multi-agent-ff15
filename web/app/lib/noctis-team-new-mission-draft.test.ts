import { describe, expect, it, vi } from "vitest";
import {
  clearNoctisTeamNewMissionDraft,
  NOCTIS_TEAM_NEW_MISSION_DRAFT_STORAGE_KEY,
  readNoctisTeamNewMissionDraft,
  writeNoctisTeamNewMissionDraft,
} from "./noctis-team-new-mission-draft";

describe("noctis-team-new-mission-draft", () => {
  it("reads a stored new-mission draft and normalizes invalid fields", () => {
    const storage = {
      getItem: vi.fn(() =>
        JSON.stringify({
          executionProjectId: "docs-repo",
          executionTargetMode: "invalid-mode",
          contextProjectIds: ["alpha", null, "beta", ""],
        }),
      ),
      removeItem: vi.fn(),
    };

    expect(readNoctisTeamNewMissionDraft(storage)).toEqual({
      executionProjectId: "docs-repo",
      executionTargetMode: "execution_project",
      contextProjectIds: ["alpha", "beta"],
    });
  });

  it("ignores legacy draft keys after the storage key version changes", () => {
    const legacyKey = "noctis-team:new-mission-draft";
    const storage = {
      getItem: vi.fn((key: string) =>
        key === legacyKey
          ? JSON.stringify({
              executionProjectId: "docs-repo",
              executionTargetMode: "mission_workspace",
              contextProjectIds: ["alpha"],
            })
          : null,
      ),
      removeItem: vi.fn(),
    };

    expect(readNoctisTeamNewMissionDraft(storage)).toBeNull();
    expect(storage.getItem).toHaveBeenCalledWith(NOCTIS_TEAM_NEW_MISSION_DRAFT_STORAGE_KEY);
    expect(storage.getItem).not.toHaveBeenCalledWith(legacyKey);
  });

  it("clears invalid draft payloads when reading", () => {
    const storage = {
      getItem: vi.fn(() => "{not-json"),
      removeItem: vi.fn(),
    };

    expect(readNoctisTeamNewMissionDraft(storage)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(NOCTIS_TEAM_NEW_MISSION_DRAFT_STORAGE_KEY);
  });

  it("writes and clears the new-mission draft", () => {
    const storage = {
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    writeNoctisTeamNewMissionDraft(storage, {
      executionProjectId: "core-repo",
      executionTargetMode: "mission_workspace",
      contextProjectIds: ["docs-repo"],
    });
    clearNoctisTeamNewMissionDraft(storage);

    expect(storage.setItem).toHaveBeenCalledWith(
      NOCTIS_TEAM_NEW_MISSION_DRAFT_STORAGE_KEY,
      JSON.stringify({
        executionProjectId: "core-repo",
        executionTargetMode: "mission_workspace",
        contextProjectIds: ["docs-repo"],
      }),
    );
    expect(storage.removeItem).toHaveBeenCalledWith(NOCTIS_TEAM_NEW_MISSION_DRAFT_STORAGE_KEY);
  });
});