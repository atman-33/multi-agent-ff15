import { handleMissionRenameAction } from "@/lib/mission-route-actions.server";
import type { Route } from "./+types/api.noctis.missions.$missionId.rename";

export const action = async ({ params, request }: Route.ActionArgs) => {
  return handleMissionRenameAction({
    missionId: params.missionId,
    request,
    surfaceId: "noctis_team",
  });
};