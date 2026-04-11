import { loadOperationByRef } from "@/lib/operation-definition/operation-catalog";
import { getOperationDisplayLabel } from "@/lib/operation-presentation";
import type { MissionWorkflowProgress, OperationState } from "@/lib/types/mission";

function countStepVisits(operationState: OperationState, currentStep: string): number {
  const visitCount = operationState.stepHistory.filter((entry) => entry.step === currentStep).length;
  return visitCount > 0 ? visitCount : 1;
}

export function buildMissionWorkflowProgress(
  operationState: OperationState | null | undefined,
): MissionWorkflowProgress | null {
  if (!operationState) {
    return null;
  }

  try {
    const operation = loadOperationByRef(operationState.operationRef);
    const currentStepIndex = operation.steps.findIndex(
      (step) => step.name === operationState.currentStep,
    );

    if (currentStepIndex < 0) {
      return null;
    }

    return {
      workflowLabel: getOperationDisplayLabel(operation.name || operationState.operationName),
      currentStep: operationState.currentStep,
      currentStepIndex: currentStepIndex + 1,
      totalSteps: operation.steps.length,
      status: operationState.status,
      updatedAt: operationState.updatedAt,
      visitCount: countStepVisits(operationState, operationState.currentStep),
      isTerminal: operationState.status === "complete" || operationState.status === "aborted",
    };
  } catch {
    return null;
  }
}