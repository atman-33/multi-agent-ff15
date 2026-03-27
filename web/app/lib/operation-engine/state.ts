import { getMission } from "@/lib/mission-store";
import type { Mission, OperationState } from "@/lib/types/mission";
import type { StateTransition } from "./types";

const DEFAULT_REPORT_DIR = "docs/reports";

/**
 * Create a fresh OperationState when an operation is activated.
 */
export function createOperationState(
  operationName: string,
  initialMovement: string,
  maxMovements: number,
): OperationState {
  const now = new Date().toISOString();
  return {
    operationName,
    currentMovement: initialMovement,
    iteration: 0,
    maxMovements,
    status: "running",
    activatedAt: now,
    updatedAt: now,
    reportDir: DEFAULT_REPORT_DIR,
    previousResponse: null,
    movementHistory: [],
    deviations: { totalDeviations: 0, history: [] },
  };
}

/**
 * Read the OperationState from a mission (returns undefined if not set).
 */
export function getOperationState(missionId: string): OperationState | undefined {
  const mission = getMission(missionId);
  return mission?.operationState;
}

/**
 * Persist operation state into the mission JSON.
 * Direct mutation + persist through mission-store.
 */
export function saveOperationState(missionId: string, state: OperationState): void {
  const mission = getMission(missionId);
  if (!mission) return;
  state.updatedAt = new Date().toISOString();
  mission.operationState = state;
  // mission-store persists on every touchMission, but we need an explicit
  // write if we mutate outside the store's touch cycle.
  // Import the persist helper to write directly.
  persistMissionDirect(mission);
}

/**
 * Record a dispatched movement in the operation history.
 */
export function recordMovementDispatched(
  state: OperationState,
  movement: string,
  agent: string,
  taskId?: string,
): void {
  state.iteration++;
  state.status = "waiting_for_report";
  state.movementHistory.push({
    movement,
    agent,
    taskId,
    status: "dispatched",
    dispatchedAt: new Date().toISOString(),
  });
}

/**
 * Record a completed movement and apply the state transition.
 */
export function recordMovementCompleted(
  state: OperationState,
  transition: StateTransition,
  summary?: string,
): void {
  // Update the last history entry
  const lastEntry = state.movementHistory.at(-1);
  if (lastEntry && lastEntry.movement === transition.previousMovement) {
    lastEntry.status = "completed";
    lastEntry.completedAt = new Date().toISOString();
    lastEntry.ruleMatched = transition.ruleMatched;
    lastEntry.ruleCondition = transition.ruleCondition;
    lastEntry.nextMovement = transition.nextMovement;
    lastEntry.summary = summary;
  }

  // Store summary as previousResponse for next movement
  if (summary) {
    state.previousResponse = summary;
  }

  // Transition to next movement
  if (transition.nextMovement === "COMPLETE") {
    state.status = "complete";
  } else if (transition.nextMovement === "ABORT") {
    state.status = "aborted";
  } else {
    state.currentMovement = transition.nextMovement;
    state.status = "running";
  }
}

// ---------------------------------------------------------------------------
// Internal: direct-write helper
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";

function persistMissionDirect(mission: Mission): void {
  const dir = join(getProjectRoot(), "runtime", "noctis-missions");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(dir, `${mission.id}.json`), JSON.stringify(mission, null, 2), "utf-8");
}
