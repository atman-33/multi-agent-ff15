import { handleMissionBanterAction } from "@/lib/banter/route-action.server";

export const action = async ({ request, params }: { request: Request; params: { missionId?: string } }) => {
  return handleMissionBanterAction({
    request,
    missionId: params.missionId,
    surfaceId: "lunafreya",
  });
};