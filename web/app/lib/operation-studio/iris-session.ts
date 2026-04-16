import type { ProjectScope } from "@/lib/project-scopes";

export const OPERATION_STUDIO_IRIS_STORAGE_KEY = "operation-studio:iris-session:v1";

export interface OperationStudioIrisSessionState {
  contextKey: string;
  sessionId: string | null;
  updatedAt: string;
}

function isOperationStudioIrisSessionState(
  value: unknown,
): value is OperationStudioIrisSessionState {
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

export function buildOperationStudioIrisContextKey(input: {
  scope: ProjectScope;
  targetValue: string;
}): string {
  return `${input.scope}::${input.targetValue.trim() || "builtin"}`;
}

export function createOperationStudioIrisSessionState(
  input: OperationStudioIrisSessionState,
): OperationStudioIrisSessionState {
  return {
    contextKey: input.contextKey,
    sessionId: input.sessionId,
    updatedAt: input.updatedAt,
  };
}

export function loadOperationStudioIrisSessionState(
  storage: Pick<Storage, "getItem">,
): OperationStudioIrisSessionState | null {
  try {
    const raw = storage.getItem(OPERATION_STUDIO_IRIS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    return isOperationStudioIrisSessionState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function persistOperationStudioIrisSessionState(
  storage: Pick<Storage, "setItem">,
  state: OperationStudioIrisSessionState,
): void {
  storage.setItem(OPERATION_STUDIO_IRIS_STORAGE_KEY, JSON.stringify(state));
}

export function shouldPromptForOperationStudioIrisReset(input: {
  currentState: OperationStudioIrisSessionState | null;
  nextContextKey: string;
}): boolean {
  if (!input.currentState?.sessionId) {
    return false;
  }

  return input.currentState.contextKey !== input.nextContextKey;
}

export function startNewOperationStudioIrisSession(input: {
  contextKey: string;
  nowIso?: string;
}): OperationStudioIrisSessionState {
  return {
    contextKey: input.contextKey,
    sessionId: null,
    updatedAt: input.nowIso ?? new Date().toISOString(),
  };
}