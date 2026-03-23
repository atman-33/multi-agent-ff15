import { listMissionSummaries } from "@/lib/mission-store";
import type { Route } from "./+types/api.noctis.missions";

export const loader = async (_args: Route.LoaderArgs) => {
  try {
    return Response.json({ missions: listMissionSummaries() });
  } catch {
    return Response.json({ missions: [] }, { status: 500 });
  }
};
