import { augmentTaskPrompt, processReport, processUserMessage } from "@/lib/operation-runtime/runtime";
import { getOperationState, saveOperationState } from "@/lib/operation-runtime/state";
import type { OperationState, ProcessReportResult, ProcessUserMessageResult } from "@/lib/operation-runtime/types";
import type { WorkerAgentId, WorkflowNext } from "@/lib/types/mission";

export function composeUserWorkflowExtension(input: {
  missionId: string;
  sessionId: string;
  message: string;
  isNewMission: boolean;
  selectedOperation?: string | null;
}): ProcessUserMessageResult {
  return processUserMessage({
    missionId: input.missionId,
    sessionId: input.sessionId,
    message: input.message,
    isNewMission: input.isNewMission,
    selectedOperation: input.selectedOperation,
  });
}

export function composeWorkerWorkflowPrompt(input: {
  missionId: string;
  originalPrompt: string;
  agentId: WorkerAgentId;
  taskId: string;
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
      taskId: input.taskId,
    }),
    usedWorkflowExtension: true,
  };
}

export function composeReportWorkflowExtension(input: {
  missionId: string;
  reportBody: string;
  fromAgent: WorkerAgentId;
  taskId: string;
  next?: WorkflowNext;
  operationStateOverride?: OperationState;
}): ProcessReportResult {
  const operationState = input.operationStateOverride ?? getOperationState(input.missionId);
  if (!operationState || (operationState.status !== "running" && operationState.status !== "waiting_for_report")) {
    return {
      noctisGuidance: "",
      stateTransition: null,
      nextWorkerDispatch: null,
    };
  }

  const result = processReport({
    operationState,
    reportBody: input.reportBody,
    missionId: input.missionId,
    fromAgent: input.fromAgent,
    taskId: input.taskId,
    next: input.next,
  });

  if (!input.operationStateOverride) {
    saveOperationState(input.missionId, operationState);
  }

  return result;
}