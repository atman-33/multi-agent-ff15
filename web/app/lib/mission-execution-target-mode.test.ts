import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEW_MISSION_EXECUTION_TARGET_MODE,
  EXECUTION_MODE_TOOLTIP_COPY,
  getMissionExecutionTargetModeLabel,
  normalizeIncomingMissionExecutionTargetMode,
} from "./mission-execution-target-mode";

describe("mission-execution-target-mode", () => {
  it("defaults new mission execution mode to execution project", () => {
    expect(DEFAULT_NEW_MISSION_EXECUTION_TARGET_MODE).toBe("execution_project");
    expect(normalizeIncomingMissionExecutionTargetMode(undefined)).toBe("execution_project");
    expect(normalizeIncomingMissionExecutionTargetMode("mission_workspace")).toBe(
      "mission_workspace",
    );
  });

  it("uses clarified mission detail labels", () => {
    expect(getMissionExecutionTargetModeLabel("execution_project")).toBe("Registered project");
    expect(getMissionExecutionTargetModeLabel("mission_workspace")).toBe(
      "Dedicated workspace",
    );
  });

  it("exposes tooltip copy that explains both execution outcomes", () => {
    expect(EXECUTION_MODE_TOOLTIP_COPY).toContain(
      "Work directly in the registered project folder",
    );
    expect(EXECUTION_MODE_TOOLTIP_COPY).toContain(
      "Create a mission-specific workspace and work there",
    );
  });
});