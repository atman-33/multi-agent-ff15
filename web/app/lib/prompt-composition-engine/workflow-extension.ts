import { augmentTaskPrompt, processReport, processUserMessage } from "@/lib/operation-runtime/runtime";
import { getOperationState, saveOperationState } from "@/lib/operation-runtime/state";
import type { OperationState, ProcessReportResult, ProcessUserMessageResult } from "@/lib/operation-runtime/types";
import type { ReportStatus, WorkerAgentId } from "@/lib/types/mission";

export function composeUserWorkflowExtension(input: {
  missionId: string;
  sessionId: string;
  message: string;
  isNewMission: boolean;
  selectedOperation?: string | null;
  lastNoctisResponse?: string;
}): ProcessUserMessageResult {
  return processUserMessage(
    {
      missionId: input.missionId,
      sessionId: input.sessionId,
      message: input.message,
      isNewMission: input.isNewMission,
      selectedOperation: input.selectedOperation,
    },
    input.lastNoctisResponse,
  );
}

export function composeWorkerWorkflowPrompt(input: {
  missionId: string;
  originalPrompt: string;
  agentId: WorkerAgentId;
  operationStateOverride?: OperationState;
}): { promptText: string; usedWorkflowExtension: boolean } {
  const operationState = input.operationStateOverride ?? getOperationState(input.missionId);
  if (!operationState || (operationState.status !== "running" && operationState.status !== "waiting_for_report")) {
    return { promptText: input.originalPrompt, usedWorkflowExtension: false };
  }

  return {
    promptText: augmentTaskPrompt({
      operationState,
      originalPrompt: input.originalPrompt,
      agentId: input.agentId,
      missionId: input.missionId,
    }),
    usedWorkflowExtension: true,
  };
}

export function composeReportWorkflowExtension(input: {
  missionId: string;
  reportBody: string;
  reportDetails?: string;
  fromAgent: WorkerAgentId;
  taskId: string;
  reportStatus: ReportStatus;
  operationStateOverride?: OperationState;
}): ProcessReportResult {
  const operationState = input.operationStateOverride ?? getOperationState(input.missionId);
  if (!operationState || (operationState.status !== "running" && operationState.status !== "waiting_for_report")) {
    return {
      noctisGuidance: "",
      stateTransition: null,
    };
  }

  const result = processReport({
    operationState,
    reportBody: input.reportBody,
    reportDetails: input.reportDetails,
    fromAgent: input.fromAgent,
    taskId: input.taskId,
    reportStatus: input.reportStatus,
  });

  if (!input.operationStateOverride) {
    saveOperationState(input.missionId, operationState);
  }

  return result;
}