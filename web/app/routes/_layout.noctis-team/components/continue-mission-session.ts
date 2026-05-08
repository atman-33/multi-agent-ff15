import type { AgentId } from "@/lib/types/mission";

export interface ContinueMissionAgentSessionResult {
  agentId: AgentId;
  missionId: string;
  sessionId: string;
}

type ContinueMissionAgentSessionPayload = Partial<ContinueMissionAgentSessionResult> & {
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

export async function continueMissionAgentSession(input: {
  missionId: string;
  agentId: AgentId;
  fetchImpl?: typeof fetch;
}): Promise<ContinueMissionAgentSessionResult> {
  const response = await (input.fetchImpl ?? fetch)(
    `/api/missions/${input.missionId}/agents/${input.agentId}/continue`,
    {
      method: "POST",
    }
  );

  const payload = (await response
    .json()
    .catch(() => null)) as ContinueMissionAgentSessionPayload | null;

  if (!response.ok) {
    const errorMessage =
      payload && typeof payload.error === "string"
        ? payload.error
        : "Unable to send raw continue";
    throw new Error(errorMessage);
  }

  if (
    !payload ||
    payload.ok !== true ||
    payload.agentId !== input.agentId ||
    payload.missionId !== input.missionId ||
    typeof payload.sessionId !== "string"
  ) {
    throw new Error("Continue route returned an invalid payload");
  }

  return {
    agentId: payload.agentId,
    missionId: payload.missionId,
    sessionId: payload.sessionId,
  };
}

export function formatContinueMissionAgentSessionSuccessMessage(
  result: ContinueMissionAgentSessionResult
): string {
  return `Sent raw continue to ${AGENT_LABELS[result.agentId]}.`;
}