import { getMission, persistMissionToDisk } from "@/lib/mission-store";
import type {
  AgentId,
  DelegatedTaskRecord,
  OperationState,
  WorkerAgentId,
} from "@/lib/types/mission";
import { getActiveStepRecord } from "./active-step";
import type { StateTransition } from "./types";

const DEFAULT_REPORT_DIR = "docs/reports";

export function createOperationState(
  operationName: string,
  initialStep: string,
  operationRef: string,
): OperationState {
  const now = new Date().toISOString();
  return {
    operationName,
    operationRef,
    currentStep: initialStep,
    iteration: 0,
    status: "running",
    activatedAt: now,
    updatedAt: now,
    reportDir: DEFAULT_REPORT_DIR,
    stepHistory: [],
    delegatedTasks: [],
    deviations: { totalDeviations: 0, history: [] },
  };
}

export function getOperationState(missionId: string): OperationState | undefined {
  const mission = getMission(missionId);
  return mission?.operationState;
}

export function getOperationRef(state: OperationState): string {
  const operationRef = (state as OperationState & { operationRef?: unknown }).operationRef;
  if (typeof operationRef !== "string" || operationRef.trim().length === 0) {
    throw new Error("Invalid operation state: missing operationRef");
  }

  return operationRef.trim();
}

export function saveOperationState(missionId: string, state: OperationState): void {
  const mission = getMission(missionId);
  if (!mission) {
    return;
  }

  const legacyState = state as OperationState & { previousResponse?: string | null };
  if ("previousResponse" in legacyState) {
    delete legacyState.previousResponse;
  }

  state.operationRef = getOperationRef(state);

  state.updatedAt = new Date().toISOString();
  mission.operationState = state;
  persistMissionToDisk(mission);
}

function createStepTaskId(state: OperationState): string {
  return `step_${state.currentStep}_${state.iteration + 1}`;
}

export { getActiveStepRecord, getActiveStepTaskId } from "./active-step";

export function ensureActiveStepTaskId(state: OperationState, agent: AgentId): string {
  const activeEntry = getActiveStepRecord(state);
  if (activeEntry?.agent === agent && activeEntry.taskId) {
    state.status = "waiting_for_report";
    return activeEntry.taskId;
  }

  const taskId = createStepTaskId(state);
  recordStepDispatched(state, state.currentStep, agent, taskId);
  return taskId;
}

export function recordStepDispatched(
  state: OperationState,
  step: string,
  agent: AgentId,
  taskId?: string,
): void {
  state.iteration++;
  state.status = "waiting_for_report";
  state.stepHistory.push({
    step,
    agent,
    taskId,
    status: "dispatched",
    dispatchedAt: new Date().toISOString(),
  });
}

export function recordStepCompleted(
  state: OperationState,
  transition: StateTransition,
  message?: string,
): void {
  const lastEntry = state.stepHistory.at(-1);
  if (lastEntry && lastEntry.step === transition.previousStep) {
    lastEntry.status = "completed";
    lastEntry.completedAt = new Date().toISOString();
    lastEntry.ruleMatched = transition.ruleMatched;
    lastEntry.ruleCondition = transition.ruleCondition;
    lastEntry.nextStep = transition.nextStep;
    lastEntry.summary = message;
  }

  if (transition.nextStep === "COMPLETE") {
    state.status = "complete";
  } else if (transition.nextStep === "ABORT") {
    state.status = "aborted";
  } else {
    state.currentStep = transition.nextStep;
    state.status = "running";
  }
}

export function getDelegatedTaskRecord(
  state: OperationState,
  taskId: string,
): DelegatedTaskRecord | undefined {
  return state.delegatedTasks.find((entry) => entry.taskId === taskId);
}

export function registerDelegatedTask(
  state: OperationState,
  input: {
    parentStep: string;
    taskId: string;
    agent: WorkerAgentId;
    message: string;
  },
): void {
  const existingEntry = getDelegatedTaskRecord(state, input.taskId);
  if (existingEntry) {
    existingEntry.parentStep = input.parentStep;
    existingEntry.agent = input.agent;
    existingEntry.status = "dispatched";
    existingEntry.message = input.message;
    existingEntry.summary = undefined;
    existingEntry.completedAt = undefined;
    return;
  }

  state.delegatedTasks.push({
    parentStep: input.parentStep,
    taskId: input.taskId,
    agent: input.agent,
    status: "dispatched",
    createdAt: new Date().toISOString(),
    message: input.message,
  });
}

export function completeDelegatedTask(
  state: OperationState,
  input: {
    taskId: string;
    status: Extract<DelegatedTaskRecord["status"], "completed" | "failed">;
    summary?: string;
  },
): void {
  const entry = getDelegatedTaskRecord(state, input.taskId);
  if (!entry) {
    return;
  }

  entry.status = input.status;
  entry.summary = input.summary;
  entry.completedAt = new Date().toISOString();
}