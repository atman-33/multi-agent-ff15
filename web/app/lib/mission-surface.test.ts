import { describe, expect, it } from "vitest";

import type { Mission } from "./types/mission";
import {
  getMissionSurface,
  getMissionSurfaceForMission,
  listMissionSurfaces,
} from "./mission-surface";

describe("mission surface", () => {
  it("returns the configured surfaces with stable route and workflow metadata", () => {
    const noctisTeam = getMissionSurface("noctis_team");
    const lunafreya = getMissionSurface("lunafreya");

    expect(noctisTeam).toMatchObject({
      id: "noctis_team",
      routeBase: "/noctis-team",
      primaryAgentId: "noctis",
      portraitSrc: "/images/noctis.png",
      hiddenOperationName: "noctis-autonomous",
      supportsBanter: true,
      supportsPartyStatus: true,
      supportsWorkflowSelector: true,
    });

    expect(lunafreya).toMatchObject({
      id: "lunafreya",
      routeBase: "/lunafreya",
      primaryAgentId: "lunafreya",
      portraitSrc: "/images/lunafreya.png",
      hiddenOperationName: "lunafreya-autonomous",
      supportsBanter: true,
      supportsPartyStatus: false,
      supportsWorkflowSelector: false,
    });
  });

  it("resolves the surface from persisted mission metadata with legacy fallback", () => {
    const legacyMission = {
      id: "surface-legacy",
      noctisSessionId: "session-noctis",
    } as Mission;
    const lunafreyaMission = {
      id: "surface-luna",
      noctisSessionId: "",
      primarySessionId: "session-luna",
      surfaceId: "lunafreya",
      primaryAgentId: "lunafreya",
    } as Mission;

    expect(getMissionSurfaceForMission(legacyMission).id).toBe("noctis_team");
    expect(getMissionSurfaceForMission(lunafreyaMission).id).toBe("lunafreya");
  });

  it("lists surfaces in stable sidebar order", () => {
    expect(listMissionSurfaces().map((surface) => surface.id)).toEqual([
      "noctis_team",
      "lunafreya",
    ]);
  });
});