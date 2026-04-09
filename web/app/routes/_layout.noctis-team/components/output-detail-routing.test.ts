import { describe, expect, it } from "vitest";

import {
  buildMissionOutputDetailPath,
  buildMissionPath,
  hasMissionOutputDetailRoute,
  resolveMissionInspectorTab,
} from "./output-detail-routing";

describe("output-detail-routing", () => {
  it("builds a mission-scoped output detail path", () => {
    expect(
      buildMissionOutputDetailPath("mission 123", {
        step: "prepare-run",
        taskId: "step_prepare-run_1",
        filename: "news run plan.md",
      }),
    ).toBe(
      "/noctis-team/mission/mission%20123/output/prepare-run/step_prepare-run_1/news%20run%20plan.md",
    );
  });

  it("forces the outputs inspector tab when an output detail route is active", () => {
    expect(hasMissionOutputDetailRoute({ step: "prepare-run", taskId: "task-1", filename: "plan.md" })).toBe(true);
    expect(resolveMissionInspectorTab("banter", true)).toBe("outputs");
    expect(resolveMissionInspectorTab("outputs", false)).toBe("outputs");
    expect(buildMissionPath("mission-123")).toBe("/noctis-team/mission/mission-123");
  });
});