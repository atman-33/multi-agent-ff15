import type { Route } from "./+types/route";
import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { readAppLanguage } from "@/lib/app-language.server";
import { NoctisTeamScreen } from "./components/noctis-team-screen";

const LAST_MISSION_STORAGE_KEY = "noctis-team:last-mission-id";

const NoctisTeamPage = ({ loaderData }: Route.ComponentProps) => {
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
    if (activeMissionId) {
      return;
    }

    if (shouldSkipMissionRestore) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const lastMissionId = window.localStorage.getItem(LAST_MISSION_STORAGE_KEY);
    if (!lastMissionId) {
      return;
    }

    void (async () => {
      try {
        const response = await fetch(`/api/noctis/missions/${lastMissionId}`);
        if (!response.ok) {
          window.localStorage.removeItem(LAST_MISSION_STORAGE_KEY);
          return;
        }

        navigate(`/noctis-team/mission/${lastMissionId}`, { replace: true });
      } catch {
        return;
      }
    })();
  }, [activeMissionId, navigate, shouldSkipMissionRestore]);

  return <NoctisTeamScreen activeMissionId={activeMissionId} language={loaderData.language} />;
};

export const loader = async () => {
  return {
    language: readAppLanguage(),
  };
};

export default NoctisTeamPage;
