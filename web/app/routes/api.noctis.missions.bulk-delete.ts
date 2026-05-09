import { handleArchivedMissionBulkDeleteAction } from "@/lib/mission-route-actions.server";
import type { Route } from "./+types/api.noctis.missions.bulk-delete";

export const action = async ({ request }: Route.ActionArgs) => {
  return handleArchivedMissionBulkDeleteAction({
    request,
    surfaceId: "noctis_team",
  });
};