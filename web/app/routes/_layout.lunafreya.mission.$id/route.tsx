import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { toast } from "sonner";
import {
  handleMissingMissionRoute,
  loadMissionExistence,
} from "@/lib/mission-route-availability";
import type { Route } from "./+types/route";

export const LunafreyaMissionPage = ({ loaderData }: Route.ComponentProps) => {
  const navigate = useNavigate();

  useEffect(() => {
    handleMissingMissionRoute({
      fallbackPath: "/lunafreya",
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
    endpointPath: "/api/lunafreya/missions",
    request,
    requestedMissionId: params.id ?? null,
  });
};

export default LunafreyaMissionPage;