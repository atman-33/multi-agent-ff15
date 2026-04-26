import { describe, expect, it } from "vitest";

import { getAgentTheme } from "./agent-theme";

describe("agent theme", () => {
  it("returns a dedicated glow theme for Iris", () => {
    expect(getAgentTheme("iris")).toMatchObject({
      accent: "#38bdf8",
      ring: "rgba(125, 211, 252, 0.68)",
      glowSoft: "rgba(56, 189, 248, 0.2)",
    });
  });
});