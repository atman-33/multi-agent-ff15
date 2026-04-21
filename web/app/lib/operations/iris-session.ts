import type { ProjectScope } from "@/lib/project-scopes";

export const OPERATIONS_IRIS_STORAGE_KEY = "operations:iris-session:v1";

export interface OperationsIrisSessionState {
  contextKey: string;
  sessionId: string | null;
  updatedAt: string;
}

function isOperationsIrisSessionState(
  value: unknown,
): value is OperationsIrisSessionState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.contextKey === "string" &&
    (candidate.sessionId === null || typeof candidate.sessionId === "string") &&
    typeof candidate.updatedAt === "string"
  );
}

export function buildOperationsIrisContextKey(input: {
  scope: ProjectScope;
  targetValue: string;
}): string {
  return `${input.scope}::${input.targetValue.trim() || "builtin"}`;
}

export function createOperationsIrisSessionState(
  input: OperationsIrisSessionState,
): OperationsIrisSessionState {
  return {
    contextKey: input.contextKey,
    sessionId: input.sessionId,
    updatedAt: input.updatedAt,
  };
}

export function loadOperationsIrisSessionState(
  storage: Pick<Storage, "getItem">,
): OperationsIrisSessionState | null {
  try {
    const raw = storage.getItem(OPERATIONS_IRIS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    return isOperationsIrisSessionState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function persistOperationsIrisSessionState(
  storage: Pick<Storage, "setItem">,
  state: OperationsIrisSessionState,
): void {
  storage.setItem(OPERATIONS_IRIS_STORAGE_KEY, JSON.stringify(state));
}

export function shouldPromptForOperationsIrisReset(input: {
  currentState: OperationsIrisSessionState | null;
  nextContextKey: string;
}): boolean {
  if (!input.currentState?.sessionId) {
    return false;
  }

  return input.currentState.contextKey !== input.nextContextKey;
}

export function startNewOperationsIrisSession(input: {
  contextKey: string;
  nowIso?: string;
}): OperationsIrisSessionState {
  return {
    contextKey: input.contextKey,
    sessionId: null,
    updatedAt: input.nowIso ?? new Date().toISOString(),
  };
}