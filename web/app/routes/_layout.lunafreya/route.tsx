import { readAppLanguage } from "@/lib/app-language.server";
import type { Route } from "./+types/route";
import { MissionSurfaceRouteShell } from "../_layout.noctis-team/components/mission-surface-route-shell";

export const LunafreyaPage = ({ loaderData }: Route.ComponentProps) => {
  return <MissionSurfaceRouteShell language={loaderData.language} surfaceId="lunafreya" />;
};

export const loader = async () => {
  return {
    language: readAppLanguage(),
  };
};

export default LunafreyaPage;