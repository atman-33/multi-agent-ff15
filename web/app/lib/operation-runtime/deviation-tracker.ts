import type {
  DeviationEntry,
  DeviationTracker,
  DeviationType,
  OperationState,
} from "@/lib/types/mission";

type WarningLevel = "none" | "info" | "warning" | "alert";

function getWarningLevel(tracker: DeviationTracker): WarningLevel {
  const count = tracker.totalDeviations;
  if (count === 0) return "none";
  if (count <= 2) return "info";
  if (count <= 4) return "warning";
  return "alert";
}

export function recordDeviation(
  state: OperationState,
  type: DeviationType,
  expected: string,
  actual: string,
): string | null {
  const entry: DeviationEntry = {
    type,
    expected,
    actual,
    timestamp: new Date().toISOString(),
  };

  state.deviations.history.push(entry);
  state.deviations.totalDeviations++;

  const level = getWarningLevel(state.deviations);

  switch (level) {
    case "info":
      return `Note: ${formatDeviationMessage(type, expected, actual)}`;
    case "warning":
      return `⚠ Warning: Operation flow deviation (${state.deviations.totalDeviations} total). ${formatDeviationMessage(type, expected, actual)}`;
    case "alert":
      return `⚠ Alert: Operation flow compliance is degrading (${state.deviations.totalDeviations} deviations). ${formatDeviationMessage(type, expected, actual)} Consider reporting the situation to User.`;
    default:
      return null;
  }
}

export function checkAgentDeviation(
  state: OperationState,
  expectedAgent: string,
  actualAgent: string,
): string | null {
  if (expectedAgent === actualAgent) {
    return null;
  }

  return recordDeviation(state, "agent_mismatch", expectedAgent, actualAgent);
}

function formatDeviationMessage(type: DeviationType, expected: string, actual: string): string {
  switch (type) {
    case "agent_mismatch":
      return `Expected agent "${expected}" but dispatched to "${actual}".`;
    case "step_skip":
      return `Expected step "${expected}" but skipped to "${actual}".`;
    case "order_deviation":
      return `Expected flow through "${expected}" but deviated to "${actual}".`;
  }
}