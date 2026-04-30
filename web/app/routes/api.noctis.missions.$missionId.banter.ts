import { handleMissionBanterAction } from "@/lib/banter/route-action.server";
import type { Route } from "./+types/api.noctis.missions.$missionId.banter";

export const action = async ({ request, params }: Route.ActionArgs) => {
  return handleMissionBanterAction({
    request,
    missionId: params.missionId,
    surfaceId: "noctis_team",
  });
};