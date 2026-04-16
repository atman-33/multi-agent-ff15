import { describe, expect, it } from "vitest";
import { parseOperationStudioAuthoringTarget } from "./authoring-target";

describe("operation-studio authoring-target", () => {
  it("normalizes builtin and project authoring targets for shared client and server callers", () => {
    expect(parseOperationStudioAuthoringTarget("builtin")).toEqual({
      kind: "builtin",
      projectId: null,
    });

    expect(parseOperationStudioAuthoringTarget("project:alpha")).toEqual({
      kind: "project",
      projectId: "alpha",
    });
  });
});