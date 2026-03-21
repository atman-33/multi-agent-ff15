import type { Route } from "./+types/route";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { NoctisTeamScreen } from "./components/noctis-team-screen";

const LAST_MISSION_STORAGE_KEY = "noctis-team:last-mission-id";

const NoctisTeamPage = (_props: Route.ComponentProps) => {
  const navigate = useNavigate();
  const params = useParams();
  const activeMissionId = params.id ?? null;

  useEffect(() => {
    if (activeMissionId) {
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
  }, [activeMissionId, navigate]);

  return <NoctisTeamScreen activeMissionId={activeMissionId} />;
};

export default NoctisTeamPage;
