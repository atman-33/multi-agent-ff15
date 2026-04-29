import { listMissionSummariesWithCounts } from "@/lib/mission-store";
import type { Route } from "./+types/api.noctis.missions";

export const loader = async ({ request }: Route.LoaderArgs) => {
  try {
    const url = new URL(request.url);
    const requestedView = url.searchParams.get("view");
    const view =
      requestedView === "archived" || requestedView === "all" || requestedView === "active"
        ? requestedView
        : "active";

    return Response.json(listMissionSummariesWithCounts({ view, surfaceId: "noctis_team" }));
  } catch {
    return Response.json({ counts: { active: 0, archived: 0 }, missions: [] }, { status: 500 });
  }
};
