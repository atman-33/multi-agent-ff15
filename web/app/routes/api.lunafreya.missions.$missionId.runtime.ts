import { missionMatchesSurface } from "@/lib/mission-api.server";
import { buildMissionSurfaceHydrationPayload } from "@/lib/mission-surface-hydration.server";
import { getMission } from "@/lib/mission-store";
import type { Route } from "./+types/api.lunafreya.missions.$missionId.runtime";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = getMission(missionId);
  if (!mission || !missionMatchesSurface(mission, "lunafreya")) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  try {
    return Response.json(await buildMissionSurfaceHydrationPayload(mission));
  } catch {
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};