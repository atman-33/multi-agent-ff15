import type { OperationState, StepHistoryEntry } from "@/lib/types/mission";

export function getActiveStepRecord(state: OperationState): StepHistoryEntry | undefined {
  const latestEntry = state.stepHistory.at(-1);
  if (!latestEntry) {
    return undefined;
  }

  if (latestEntry.step !== state.currentStep || latestEntry.status !== "dispatched") {
    return undefined;
  }

  return latestEntry;
}

export function getActiveStepTaskId(state: OperationState): string | undefined {
  return getActiveStepRecord(state)?.taskId;
}