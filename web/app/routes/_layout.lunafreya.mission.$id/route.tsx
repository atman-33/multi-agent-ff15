import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { toast } from "sonner";
import type { Route } from "./+types/route";

export const LunafreyaMissionPage = ({ loaderData }: Route.ComponentProps) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (loaderData.exists) {
      return;
    }

    toast.error("Mission not found", {
      description: loaderData.requestedMissionId
        ? `Mission ${loaderData.requestedMissionId} could not be restored.`
        : "The selected mission could not be restored.",
    });
    navigate("/lunafreya", { replace: true });
  }, [loaderData.exists, loaderData.requestedMissionId, navigate]);

  return <Outlet />;
};

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const requestedMissionId = params.id ?? null;
  if (!requestedMissionId) {
    return { exists: false, requestedMissionId };
  }

  try {
    const url = new URL(request.url);
    const response = await fetch(`${url.origin}/api/lunafreya/missions/${requestedMissionId}`);
    return {
      exists: response.ok,
      requestedMissionId,
    };
  } catch {
    return {
      exists: false,
      requestedMissionId,
    };
  }
};

export default LunafreyaMissionPage;