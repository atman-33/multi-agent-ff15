import { listMissionSummaries } from "@/lib/mission-store";
import type { Route } from "./+types/api.noctis.missions";

export const loader = async ({ request }: Route.LoaderArgs) => {
  try {
    const url = new URL(request.url);
    const requestedView = url.searchParams.get("view");
    const view =
      requestedView === "archived" || requestedView === "all" || requestedView === "active"
        ? requestedView
        : "active";

    return Response.json({ missions: listMissionSummaries({ view }) });
  } catch {
    return Response.json({ missions: [] }, { status: 500 });
  }
};
