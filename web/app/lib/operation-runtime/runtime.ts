import { createOperationInstantiator } from "./operation-instantiator";
import type {
  AugmentTaskPromptInput,
  ProcessUserMessageInput,
  ProcessUserMessageResult,
  ProcessReportInput,
  ProcessReportResult,
} from "./types";

const operationInstantiator = createOperationInstantiator();

export function processUserMessage(
  input: ProcessUserMessageInput,
): ProcessUserMessageResult {
  return operationInstantiator.activateOperation({
    missionId: input.missionId,
    message: input.message,
    selectedOperation: input.selectedOperation,
  });
}

export function augmentTaskPrompt(input: AugmentTaskPromptInput): string {
  return operationInstantiator.augmentTaskPrompt({
    missionId: input.missionId,
    originalPrompt: input.originalPrompt,
    agentId: input.agentId,
    taskId: input.taskId,
    operationState: input.operationState,
  }).promptText;
}

export function processReport(input: ProcessReportInput): ProcessReportResult {
  return operationInstantiator.processStepReport({
    missionId: input.missionId,
    reportBody: input.reportBody,
    fromAgent: input.fromAgent,
    taskId: input.taskId,
    next: input.next,
    operationState: input.operationState,
  });
}