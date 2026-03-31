import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { getMission } from "@/lib/mission-store";
import type { Mission, OperationState } from "@/lib/types/mission";
import type { StateTransition } from "./types";

const DEFAULT_REPORT_DIR = "docs/reports";

export function createOperationState(
  operationName: string,
  initialStep: string,
): OperationState {
  const now = new Date().toISOString();
  return {
    operationName,
    currentStep: initialStep,
    iteration: 0,
    status: "running",
    activatedAt: now,
    updatedAt: now,
    reportDir: DEFAULT_REPORT_DIR,
    previousResponse: null,
    stepHistory: [],
    deviations: { totalDeviations: 0, history: [] },
  };
}

export function getOperationState(missionId: string): OperationState | undefined {
  const mission = getMission(missionId);
  return mission?.operationState;
}

export function saveOperationState(missionId: string, state: OperationState): void {
  const mission = getMission(missionId);
  if (!mission) {
    return;
  }

  state.updatedAt = new Date().toISOString();
  mission.operationState = state;
  persistMissionDirect(mission);
}

export function recordStepDispatched(
  state: OperationState,
  step: string,
  agent: string,
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
  summary?: string,
): void {
  const lastEntry = state.stepHistory.at(-1);
  if (lastEntry && lastEntry.step === transition.previousStep) {
    lastEntry.status = "completed";
    lastEntry.completedAt = new Date().toISOString();
    lastEntry.ruleMatched = transition.ruleMatched;
    lastEntry.ruleCondition = transition.ruleCondition;
    lastEntry.nextStep = transition.nextStep;
    lastEntry.summary = summary;
  }

  if (summary) {
    state.previousResponse = summary;
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

function persistMissionDirect(mission: Mission): void {
  const directory = join(getProjectRoot(), "runtime", "noctis-missions");
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  writeFileSync(join(directory, `${mission.id}.json`), JSON.stringify(mission, null, 2), "utf-8");
}