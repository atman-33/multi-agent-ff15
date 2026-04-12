import { handleMissionContextAction } from "@/lib/mission-route-actions.server";
import type { Route } from "./+types/api.noctis.missions.$missionId.context";

export const action = async ({ params, request }: Route.ActionArgs) => {
  return handleMissionContextAction({
    missionId: params.missionId,
    request,
    surfaceId: "noctis_team",
  });
};