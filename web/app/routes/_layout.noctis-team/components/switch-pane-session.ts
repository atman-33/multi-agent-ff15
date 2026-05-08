import type { AgentId } from "@/lib/types/mission";

export interface SwitchMissionAgentPaneSessionResult {
  agentId: AgentId;
  missionId: string;
  sessionId: string;
  sessionTitle: string;
}

type SwitchMissionAgentPaneSessionPayload = Partial<SwitchMissionAgentPaneSessionResult> & {
  error?: unknown;
  ok?: unknown;
};

const AGENT_LABELS: Record<AgentId, string> = {
  noctis: "Noctis",
  lunafreya: "Lunafreya",
  ignis: "Ignis",
  gladiolus: "Gladiolus",
  prompto: "Prompto",
};

export async function switchMissionAgentPaneSession(input: {
  missionId: string;
  agentId: AgentId;
  fetchImpl?: typeof fetch;
}): Promise<SwitchMissionAgentPaneSessionResult> {
  const response = await (input.fetchImpl ?? fetch)(
    `/api/missions/${input.missionId}/agents/${input.agentId}/switch-pane-session`,
    {
      method: "POST",
    }
  );

  const payload = (await response
    .json()
    .catch(() => null)) as SwitchMissionAgentPaneSessionPayload | null;

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload.error === "string"
        ? payload.error
        : "Unable to switch pane session";
    throw new Error(errorMessage);
  }

  if (
    !payload ||
    payload.ok !== true ||
    payload.agentId !== input.agentId ||
    payload.missionId !== input.missionId ||
    typeof payload.sessionId !== "string" ||
    typeof payload.sessionTitle !== "string"
  ) {
    throw new Error("Switch pane session route returned an invalid payload");
  }

  return {
    agentId: payload.agentId,
    missionId: payload.missionId,
    sessionId: payload.sessionId,
    sessionTitle: payload.sessionTitle,
  };
}

export function formatSwitchMissionAgentPaneSessionSuccessMessage(
  result: SwitchMissionAgentPaneSessionResult
): string {
  return `Switched ${AGENT_LABELS[result.agentId]} to the current mission session.`;
}
