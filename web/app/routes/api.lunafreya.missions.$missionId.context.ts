import { handleMissionContextAction } from "@/lib/mission-route-actions.server";
import type { Route } from "./+types/api.lunafreya.missions.$missionId.context";

export const action = async ({ params, request }: Route.ActionArgs) => {
  return handleMissionContextAction({
    missionId: params.missionId,
    request,
    surfaceId: "lunafreya",
  });
};