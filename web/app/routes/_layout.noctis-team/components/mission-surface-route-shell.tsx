import { useEffect } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router";
import type { AppLanguage } from "@/lib/app-language.server";
import { getMissionSurface } from "@/lib/mission-surface";
import type { MissionSurfaceId } from "@/lib/types/mission";
import { NoctisTeamScreen } from "./noctis-team-screen";

export interface MissionSurfaceRouteShellProps {
  language: AppLanguage;
  surfaceId?: MissionSurfaceId;
}

const getMissionApiBase = (surfaceId: MissionSurfaceId) =>
  surfaceId === "lunafreya" ? "/api/lunafreya/missions" : "/api/noctis/missions";

export const MissionSurfaceRouteShell = ({
  language,
  surfaceId = "noctis_team",
}: MissionSurfaceRouteShellProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const activeMissionId = params.id ?? null;
  const surface = getMissionSurface(surfaceId);
  const shouldSkipMissionRestore =
    location.state !== null &&
    typeof location.state === "object" &&
    "skipMissionRestore" in location.state &&
    location.state.skipMissionRestore === true;

  useEffect(() => {
    if (activeMissionId || shouldSkipMissionRestore || typeof window === "undefined") {
      return;
    }

    const lastMissionId = window.localStorage.getItem(surface.lastMissionStorageKey);
    if (!lastMissionId) {
      return;
    }

    void (async () => {
      try {
        const response = await fetch(`${getMissionApiBase(surface.id)}/${lastMissionId}`);
        if (!response.ok) {
          window.localStorage.removeItem(surface.lastMissionStorageKey);
          return;
        }

        const mission = (await response.json()) as { status?: string };
        if (mission.status === "archived") {
          window.localStorage.removeItem(surface.lastMissionStorageKey);
          return;
        }

        navigate(`${surface.routeBase}/mission/${lastMissionId}`, { replace: true });
      } catch {
        return;
      }
    })();
  }, [activeMissionId, navigate, shouldSkipMissionRestore, surface]);

  return (
    <>
      <NoctisTeamScreen activeMissionId={activeMissionId} language={language} surfaceId={surface.id} />
      <Outlet />
    </>
  );
};