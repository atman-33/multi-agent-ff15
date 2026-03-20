import type { Route } from "./+types/api.noctis.missions";
import { listMissionSummaries } from "@/lib/mission-store";

export const loader = async (_args: Route.LoaderArgs) => {
  try {
    return Response.json({ missions: listMissionSummaries() });
  } catch {
    return Response.json({ missions: [] }, { status: 500 });
  }
};
