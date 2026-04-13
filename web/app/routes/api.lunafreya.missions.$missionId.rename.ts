import { handleMissionRenameAction } from "@/lib/mission-route-actions.server";
import type { Route } from "./+types/api.lunafreya.missions.$missionId.rename";

export const action = async ({ params, request }: Route.ActionArgs) => {
  return handleMissionRenameAction({
    missionId: params.missionId,
    request,
    surfaceId: "lunafreya",
  });
};