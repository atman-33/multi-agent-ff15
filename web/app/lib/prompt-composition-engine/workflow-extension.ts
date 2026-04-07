import { createOperationInstantiator } from "@/lib/operation-runtime/operation-instantiator";
import { getOperationState } from "@/lib/operation-runtime/state";
import type { OperationState, ProcessReportResult, ProcessUserMessageResult } from "@/lib/operation-runtime/types";
import type { WorkerAgentId, WorkflowNext } from "@/lib/types/mission";

const operationInstantiator = createOperationInstantiator();

export function composeUserWorkflowExtension(input: {
  missionId: string;
  sessionId: string;
  message: string;
  isNewMission: boolean;
  selectedOperation?: string | null;
}): ProcessUserMessageResult {
  return operationInstantiator.activateOperation({
    missionId: input.missionId,
    message: input.message,
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

  const result = operationInstantiator.augmentTaskPrompt({
    missionId: input.missionId,
    originalPrompt: input.originalPrompt,
    agentId: input.agentId,
    taskId: input.taskId,
    operationState,
  });

  return {
    promptText: result.promptText,
    usedWorkflowExtension: result.usedOperationPrompt,
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

  return operationInstantiator.processStepReport({
    reportBody: input.reportBody,
    missionId: input.missionId,
    fromAgent: input.fromAgent,
    taskId: input.taskId,
    next: input.next,
    operationState,
  });
}