import { areModelSelectionsEqual, isModelSelection } from "@/lib/model-variant-selection";
import type { ModelSelection } from "@/lib/types/mission";

export type SessionSelection = {
  agent: string | null;
  model: ModelSelection | null;
};

export type SessionSelectionAdjustment = {
  actual: SessionSelection;
  explanation: string;
  requestMessageId: string;
  requested: SessionSelection;
};

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isSessionSelection(value: unknown): value is SessionSelection {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    isStringOrNull(candidate.agent) &&
    (candidate.model === null || candidate.model === undefined || isModelSelection(candidate.model))
  );
}

export function isSessionSelectionAdjustment(value: unknown): value is SessionSelectionAdjustment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.explanation === "string" &&
    typeof candidate.requestMessageId === "string" &&
    isSessionSelection(candidate.requested) &&
    isSessionSelection(candidate.actual)
  );
}

export function hasTrackedSelectionDifference(
  requested: SessionSelection,
  actual: SessionSelection,
): boolean {
  const agentChanged = requested.agent !== null && requested.agent !== actual.agent;
  const modelChanged =
    requested.model !== null && !areModelSelectionsEqual(requested.model, actual.model);

  return agentChanged || modelChanged;
}