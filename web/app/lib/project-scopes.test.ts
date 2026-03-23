import { describe, expect, it } from "vitest";

import { getProjectScopeForAgent } from "./project-scopes";

describe("getProjectScopeForAgent", () => {
  it("maps team agents and standalone agents to the expected scopes", () => {
    expect(getProjectScopeForAgent("noctis")).toBe("noctis_team");
    expect(getProjectScopeForAgent("ignis")).toBe("noctis_team");
    expect(getProjectScopeForAgent("gladiolus")).toBe("noctis_team");
    expect(getProjectScopeForAgent("prompto")).toBe("noctis_team");
    expect(getProjectScopeForAgent("lunafreya")).toBe("lunafreya");
    expect(getProjectScopeForAgent("iris")).toBeNull();
  });
});
