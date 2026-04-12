import { handleMissionWorkspaceDeleteAction } from "@/lib/mission-route-actions.server";
import type { Route } from "./+types/api.noctis.missions.$missionId.workspace";

export const action = async ({ params, request }: Route.ActionArgs) => {
  return handleMissionWorkspaceDeleteAction({
    missionId: params.missionId,
    request,
    surfaceId: "noctis_team",
  });
};