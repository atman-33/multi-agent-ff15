import { describe, expect, it } from "vitest";
import type { MissionSummary } from "@/lib/types/mission";
import { reconcileFreshMissionIds } from "./mission-summary-freshness";

function createMissionSummary(overrides: Partial<MissionSummary> = {}): MissionSummary {
  return {
    missionId: "mission-1",
    title: "Mission One",
    createdAt: "2026-04-13T00:00:00.000Z",
    updatedAt: "2026-04-13T00:00:00.000Z",
    status: "active",
    activitySessionIds: ["session-1"],
    latestPrimaryMessageId: null,
    latestPrimaryMessageCreatedAt: null,
    ...overrides,
  };
}

describe("mission-summary-freshness", () => {
  it("does not mark missions fresh on the first summary load", () => {
    expect(
      reconcileFreshMissionIds({
        currentFreshMissionIds: [],
        previousMissions: [],
        nextMissions: [
          createMissionSummary({
            latestPrimaryMessageId: "message-1",
            latestPrimaryMessageCreatedAt: "2026-04-13T00:01:00.000Z",
          }),
        ],
        activeMissionId: null,
      }),
    ).toEqual([]);
  });

  it("marks a mission fresh when the latest primary message changes on a later poll", () => {
    expect(
      reconcileFreshMissionIds({
        currentFreshMissionIds: [],
        previousMissions: [
          createMissionSummary({
            latestPrimaryMessageId: "message-1",
            latestPrimaryMessageCreatedAt: "2026-04-13T00:01:00.000Z",
          }),
        ],
        nextMissions: [
          createMissionSummary({
            latestPrimaryMessageId: "message-2",
            latestPrimaryMessageCreatedAt: "2026-04-13T00:02:00.000Z",
          }),
        ],
        activeMissionId: null,
      }),
    ).toEqual(["mission-1"]);
  });

  it("retains fresh missions across unchanged polls until the mission becomes active", () => {
    expect(
      reconcileFreshMissionIds({
        currentFreshMissionIds: ["mission-1"],
        previousMissions: [
          createMissionSummary({
            latestPrimaryMessageId: "message-2",
            latestPrimaryMessageCreatedAt: "2026-04-13T00:02:00.000Z",
          }),
        ],
        nextMissions: [
          createMissionSummary({
            latestPrimaryMessageId: "message-2",
            latestPrimaryMessageCreatedAt: "2026-04-13T00:02:00.000Z",
          }),
        ],
        activeMissionId: "mission-1",
      }),
    ).toEqual([]);
  });
});