import type { Route } from "./+types/route";
import { useParams } from "react-router";
import { NoctisTeamScreen } from "./components/noctis-team-screen";

const NoctisTeamPage = (_props: Route.ComponentProps) => {
  const params = useParams();
  const activeMissionId = params.id ?? null;

  return <NoctisTeamScreen activeMissionId={activeMissionId} />;
};

export default NoctisTeamPage;
