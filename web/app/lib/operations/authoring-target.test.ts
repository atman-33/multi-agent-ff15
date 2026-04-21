import { describe, expect, it } from "vitest";
import { parseOperationsAuthoringTarget } from "./authoring-target";

describe("operations authoring-target", () => {
  it("normalizes builtin and project authoring targets for shared client and server callers", () => {
    expect(parseOperationsAuthoringTarget("builtin")).toEqual({
      kind: "builtin",
      projectId: null,
    });

    expect(parseOperationsAuthoringTarget("project:alpha")).toEqual({
      kind: "project",
      projectId: "alpha",
    });
  });
});