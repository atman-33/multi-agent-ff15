import { readAppLanguage } from "@/lib/app-language.server";
import type { Route } from "./+types/route";
import { MissionSurfaceRouteShell } from "./components/mission-surface-route-shell";

export const NoctisTeamPage = ({ loaderData }: Route.ComponentProps) => {
  return <MissionSurfaceRouteShell language={loaderData.language} />;
};

export const loader = async () => {
  return {
    language: readAppLanguage(),
  };
};

export default NoctisTeamPage;
