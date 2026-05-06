import type { WorkerAgentId } from "@/lib/types/mission";

export interface ResumeActiveWorkerStepResult {
  agentId: WorkerAgentId;
  stepName: string;
  taskId: string;
  sessionId: string;
}

type ResumeActiveWorkerStepPayload = Partial<ResumeActiveWorkerStepResult> & {
  error?: unknown;
};

const AGENT_LABELS: Record<WorkerAgentId, string> = {
  ignis: "Ignis",
  gladiolus: "Gladiolus",
  prompto: "Prompto",
};

export async function resumeActiveWorkerStep(input: {
  missionId: string;
  agentId: WorkerAgentId;
  fetchImpl?: typeof fetch;
}): Promise<ResumeActiveWorkerStepResult> {
  const response = await (input.fetchImpl ?? fetch)(
    `/api/missions/${input.missionId}/resume-active-step`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: input.agentId }),
    },
  );

  const payload = (await response.json().catch(() => null)) as
    | ResumeActiveWorkerStepPayload
    | null;

  if (!response.ok) {
    const errorMessage =
      payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Unable to resume active worker step";
    throw new Error(errorMessage);
  }

  if (
    !payload ||
    payload.agentId !== input.agentId ||
    typeof payload.stepName !== "string" ||
    typeof payload.taskId !== "string" ||
    typeof payload.sessionId !== "string"
  ) {
    throw new Error("Resume route returned an invalid payload");
  }

  return {
    agentId: payload.agentId,
    stepName: payload.stepName,
    taskId: payload.taskId,
    sessionId: payload.sessionId,
  };
}

export function formatResumeActiveWorkerStepSuccessMessage(
  result: ResumeActiveWorkerStepResult,
): string {
  return `Resumed ${AGENT_LABELS[result.agentId]} for ${result.stepName}.`;
}