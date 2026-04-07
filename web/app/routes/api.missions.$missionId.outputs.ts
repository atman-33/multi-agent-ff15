import { listMissionOutputs } from "@/lib/mission-output-metadata.server";
import { getMission } from "@/lib/mission-store";

export function loader({ params }: { params: { missionId?: string } }) {
  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  return Response.json({ outputs: listMissionOutputs(missionId) });
}