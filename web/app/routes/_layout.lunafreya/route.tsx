import { useEffect } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router";
import { readAppLanguage } from "@/lib/app-language.server";
import type { Route } from "./+types/route";
import { NoctisTeamScreen } from "../_layout.noctis-team/components/noctis-team-screen";

const LAST_MISSION_STORAGE_KEY = "lunafreya:last-mission-id";

export const LunafreyaPage = ({ loaderData }: Route.ComponentProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const activeMissionId = params.id ?? null;
  const shouldSkipMissionRestore =
    location.state !== null &&
    typeof location.state === "object" &&
    "skipMissionRestore" in location.state &&
    location.state.skipMissionRestore === true;

  useEffect(() => {
    if (activeMissionId || shouldSkipMissionRestore || typeof window === "undefined") {
      return;
    }

    const lastMissionId = window.localStorage.getItem(LAST_MISSION_STORAGE_KEY);
    if (!lastMissionId) {
      return;
    }

    void (async () => {
      try {
        const response = await fetch(`/api/lunafreya/missions/${lastMissionId}`);
        if (!response.ok) {
          window.localStorage.removeItem(LAST_MISSION_STORAGE_KEY);
          return;
        }

        const mission = (await response.json()) as { status?: string };
        if (mission.status === "archived") {
          window.localStorage.removeItem(LAST_MISSION_STORAGE_KEY);
          return;
        }

        navigate(`/lunafreya/mission/${lastMissionId}`, { replace: true });
      } catch {
        return;
      }
    })();
  }, [activeMissionId, navigate, shouldSkipMissionRestore]);

  if (activeMissionId) {
    return <Outlet />;
  }

  return (
    <NoctisTeamScreen
      activeMissionId={activeMissionId}
      language={loaderData.language}
      surfaceId="lunafreya"
    />
  );
};

export const loader = async () => {
  return {
    language: readAppLanguage(),
  };
};

export default LunafreyaPage;