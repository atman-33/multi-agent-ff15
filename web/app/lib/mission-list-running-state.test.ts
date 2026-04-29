import { describe, expect, it } from "vitest";
import type { MissionSummary } from "@/lib/types/mission";
import { isMissionSummaryRunning } from "./mission-list-running-state";

function createMissionSummary(activitySessionIds: string[]): MissionSummary {
  return {
    missionId: "mission-1",
    title: "Mission",
    createdAt: "2026-04-13T00:00:00.000Z",
    updatedAt: "2026-04-13T00:00:00.000Z",
    status: "active",
    activitySessionIds,
  };
}

describe("mission-list-running-state", () => {
  it("prefers summary agent statuses when they are available", () => {
    expect(
      isMissionSummaryRunning(
        {
          ...createMissionSummary(["session-primary"]),
          agentStatuses: {
            noctis: "busy",
          },
        },
        {
          "session-primary": "idle",
        },
      ),
    ).toBe(true);
  });

  it("returns true when the primary mission session is active", () => {
    expect(
      isMissionSummaryRunning(createMissionSummary(["session-primary"]), {
        "session-primary": "busy",
      }),
    ).toBe(true);
  });

  it("returns true when only a worker mission session is active", () => {
    expect(
      isMissionSummaryRunning(createMissionSummary(["session-primary", "session-worker"]), {
        "session-primary": "idle",
        "session-worker": "retry",
      }),
    ).toBe(true);
  });

  it("returns false when all mission-owned sessions are settled", () => {
    expect(
      isMissionSummaryRunning(createMissionSummary(["session-primary", "session-worker"]), {
        "session-primary": "idle",
        "session-worker": "idle",
      }),
    ).toBe(false);
  });
});