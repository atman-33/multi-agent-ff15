import { handleMissionArchiveAction } from "@/lib/mission-route-actions.server";
import type { Route } from "./+types/api.lunafreya.missions.$missionId.archive";

export const action = async ({ params, request }: Route.ActionArgs) => {
  return handleMissionArchiveAction({
    missionId: params.missionId,
    request,
    surfaceId: "lunafreya",
  });
};