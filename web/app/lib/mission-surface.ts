import type { Mission, MissionPrimaryAgentId, MissionSurfaceId } from "./types/mission";

export interface MissionSurfaceDefinition {
  id: MissionSurfaceId;
  label: string;
  routeBase: string;
  primaryAgentId: MissionPrimaryAgentId;
  portraitSrc: string;
  hiddenOperationName: string;
  lastMissionStorageKey: string;
  supportsBanter: boolean;
  supportsPartyStatus: boolean;
  supportsWorkflowSelector: boolean;
}

const MISSION_SURFACES: MissionSurfaceDefinition[] = [
  {
    id: "noctis_team",
    label: "Noctis Team",
    routeBase: "/noctis-team",
    primaryAgentId: "noctis",
    portraitSrc: "/images/noctis.png",
    hiddenOperationName: "noctis-autonomous",
    lastMissionStorageKey: "noctis-team:last-mission-id",
    supportsBanter: true,
    supportsPartyStatus: true,
    supportsWorkflowSelector: true,
  },
  {
    id: "lunafreya",
    label: "Lunafreya",
    routeBase: "/lunafreya",
    primaryAgentId: "lunafreya",
    portraitSrc: "/images/lunafreya.png",
    hiddenOperationName: "lunafreya-autonomous",
    lastMissionStorageKey: "lunafreya:last-mission-id",
    supportsBanter: true,
    supportsPartyStatus: false,
    supportsWorkflowSelector: false,
  },
];

export function listMissionSurfaces(): MissionSurfaceDefinition[] {
  return [...MISSION_SURFACES];
}

export function getMissionSurface(id: MissionSurfaceId): MissionSurfaceDefinition {
  const surface = MISSION_SURFACES.find((entry) => entry.id === id);
  if (!surface) {
    throw new Error(`Unknown mission surface: ${id}`);
  }

  return surface;
}

function inferMissionSurfaceId(mission: Mission): MissionSurfaceId {
  if (mission.surfaceId) {
    return mission.surfaceId;
  }

  return mission.primaryAgentId === "lunafreya" ? "lunafreya" : "noctis_team";
}

export function getMissionSurfaceForMission(mission: Mission): MissionSurfaceDefinition {
  return getMissionSurface(inferMissionSurfaceId(mission));
}