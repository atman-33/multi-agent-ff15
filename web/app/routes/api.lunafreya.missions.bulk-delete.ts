import { handleArchivedMissionBulkDeleteAction } from "@/lib/mission-route-actions.server";
import type { Route } from "./+types/api.lunafreya.missions.bulk-delete";

export const action = async ({ request }: Route.ActionArgs) => {
  return handleArchivedMissionBulkDeleteAction({
    request,
    surfaceId: "lunafreya",
  });
};