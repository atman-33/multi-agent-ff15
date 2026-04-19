import { describe, expect, it } from "vitest";

import {
  buildMissionOutputDetailKey,
  buildMissionOutputDetailPath,
  buildMissionPath,
  hasMissionOutputDetailRoute,
  resolveMissionOutputDetailActive,
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
    expect(resolveMissionInspectorTab("activity", true)).toBe("outputs");
    expect(resolveMissionInspectorTab("outputs", false)).toBe("outputs");
    expect(buildMissionPath("mission-123")).toBe("/noctis-team/mission/mission-123");
    expect(buildMissionPath("mission-123", "/lunafreya")).toBe("/lunafreya/mission/mission-123");
  });

  it("prefers the visual override when resolving output detail activity", () => {
    expect(
      resolveMissionOutputDetailActive(
        { step: "prepare-run", taskId: "task-1", filename: "plan.md" },
        false,
      ),
    ).toBe(false);
    expect(
      resolveMissionOutputDetailActive(
        { step: "prepare-run", taskId: "task-1", filename: "plan.md" },
        true,
      ),
    ).toBe(true);
    expect(
      resolveMissionOutputDetailActive({ step: null, taskId: "task-1", filename: "plan.md" }),
    ).toBe(false);
  });

  it("builds a stable key only for active output detail routes", () => {
    expect(
      buildMissionOutputDetailKey({
        step: "prepare-run",
        taskId: "task-1",
        filename: "plan.md",
      }),
    ).toBe("prepare-run:task-1:plan.md");
    expect(buildMissionOutputDetailKey({ step: null, taskId: "task-1", filename: "plan.md" })).toBeNull();
  });
});