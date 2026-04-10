import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { toast } from "sonner";
import { readAppLanguage } from "@/lib/app-language.server";
import type { MessageInfo } from "@/routes/_layout.opencode.session.$id/types";
import { NoctisTeamScreen } from "../_layout.noctis-team/components/noctis-team-screen";
import type { Route } from "./+types/route";

const NoctisTeamMissionPage = ({ loaderData }: Route.ComponentProps) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (loaderData.exists) {
      return;
    }

    toast.error("Mission not found", {
      description: loaderData.requestedMissionId
        ? `Mission ${loaderData.requestedMissionId} could not be restored.`
        : "The selected mission could not be restored.",
    });
    navigate("/noctis-team", { replace: true });
  }, [loaderData.exists, loaderData.requestedMissionId, navigate]);

  return (
    <>
      <NoctisTeamScreen
        activeMissionId={loaderData.exists ? loaderData.requestedMissionId : null}
        language={loaderData.language}
        initialMessageInfos={loaderData.messages}
        initialMissionData={loaderData.mission}
      />
      <Outlet />
    </>
  );
};

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const language = readAppLanguage();
  const requestedMissionId = params.id ?? null;
  if (!requestedMissionId) {
    return { exists: false, requestedMissionId, language };
  }

  try {
    const url = new URL(request.url);
    const response = await fetch(`${url.origin}/api/noctis/missions/${requestedMissionId}`);
    if (!response.ok) {
      return {
        exists: false,
        language,
        requestedMissionId,
        mission: null,
        messages: null,
      };
    }

    const mission = await response.json();
    const messages = mission.sessions?.noctis
      ? await (async () => {
          const messagesResponse = await fetch(`${url.origin}/api/session/${mission.sessions.noctis}`);
          return messagesResponse.ok
            ? (((await messagesResponse.json()) as { messages?: MessageInfo[] }).messages ?? [])
            : null;
        })()
      : [];

    return {
      exists: true,
      language,
      requestedMissionId,
      mission,
      messages,
    };
  } catch {
    return {
      exists: false,
      language,
      requestedMissionId,
      mission: null,
      messages: null,
    };
  }
};

export default NoctisTeamMissionPage;
