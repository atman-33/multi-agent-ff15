import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  handleMissingMissionRoute,
  loadMissionExistence,
} from "@/lib/mission-route-availability";
import type { Route } from "./+types/route";

export const NoctisTeamMissionPage = ({ loaderData }: Route.ComponentProps) => {
  const navigate = useNavigate();

  useEffect(() => {
    handleMissingMissionRoute({
      fallbackPath: "/noctis-team",
      loaderData,
      navigate,
      notify: (message, options) => {
        toast.error(message, options);
      },
    });
  }, [loaderData, navigate]);

  return <Outlet />;
};

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  return loadMissionExistence({
    endpointPath: "/api/noctis/missions",
    request,
    requestedMissionId: params.id ?? null,
  });
};

export default NoctisTeamMissionPage;
