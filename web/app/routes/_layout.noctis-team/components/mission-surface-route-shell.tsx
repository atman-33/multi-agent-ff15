import { useEffect } from "react";
import { Outlet, useLocation, useMatch, useNavigate, useParams } from "react-router";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { AppLanguage } from "@/lib/app-language.server";
import { useSheetTransition } from "@/hooks/use-sheet-transition";
import { getMissionSurface } from "@/lib/mission-surface";
import type { MissionSurfaceId } from "@/lib/types/mission";
import {
  buildMissionOutputDetailKey,
  buildMissionPath,
} from "./output-detail-routing";
import { NoctisTeamScreen } from "./noctis-team-screen";

export interface MissionSurfaceRouteShellProps {
  language: AppLanguage;
  surfaceId?: MissionSurfaceId;
}

const getMissionApiBase = (surfaceId: MissionSurfaceId) =>
  surfaceId === "lunafreya" ? "/api/lunafreya/missions" : "/api/noctis/missions";

const SHEET_CLOSE_ANIMATION_MS = 300;

export const MissionSurfaceRouteShell = ({
  language,
  surfaceId = "noctis_team",
}: MissionSurfaceRouteShellProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const activeMissionId = params.id ?? null;
  const surface = getMissionSurface(surfaceId);
  const outputDetailMatch = useMatch(
    `${surface.routeBase}/mission/:id/output/:step/:taskId/:filename`,
  );
  const outputDetailKey = buildMissionOutputDetailKey({
    filename: outputDetailMatch?.params.filename ?? null,
    step: outputDetailMatch?.params.step ?? null,
    taskId: outputDetailMatch?.params.taskId ?? null,
  });
  const outputDetailTransition = useSheetTransition({
    activeKey: outputDetailKey,
    closeDurationMs: SHEET_CLOSE_ANIMATION_MS,
    onCloseComplete: () => {
      navigate(activeMissionId ? buildMissionPath(activeMissionId, surface.routeBase) : surface.routeBase);
    },
  });
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
      <NoctisTeamScreen
        activeMissionId={activeMissionId}
        language={language}
        surfaceId={surface.id}
        visualOutputDetailActive={outputDetailTransition.isVisualRouteActive}
      />
      {outputDetailKey ? (
        <Sheet
          onOpenChange={outputDetailTransition.handleOpenChange}
          open={outputDetailTransition.isSheetOpen}
        >
          <SheetContent
            className="w-[98vw] max-w-[98vw] p-0 sm:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl"
            onAnimationEnd={outputDetailTransition.handleContentAnimationEnd}
            showCloseButton={false}
          >
            <Outlet />
          </SheetContent>
        </Sheet>
      ) : (
        <Outlet />
      )}
    </>
  );
};