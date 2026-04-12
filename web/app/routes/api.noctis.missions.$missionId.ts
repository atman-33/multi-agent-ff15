import { buildMissionResumePayload, missionMatchesSurface } from "@/lib/mission-api.server";
import { getMission } from "@/lib/mission-store";
import type { Route } from "./+types/api.noctis.missions.$missionId";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = getMission(missionId);
  if (!mission || !missionMatchesSurface(mission, "noctis_team")) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  return Response.json(buildMissionResumePayload(mission));
};
