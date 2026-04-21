export const PROJECT_IRIS_STORAGE_KEY = "ff15.projects.iris.session";

export type ProjectIrisSessionState = {
  sessionId: string | null;
  updatedAt: string;
};

type ReadableStorage = {
  getItem(key: string): string | null;
};

type WritableStorage = {
  setItem(key: string, value: string): void;
};

type RemovableStorage = {
  removeItem(key: string): void;
};

export function createProjectIrisSessionState(
  input: ProjectIrisSessionState,
): ProjectIrisSessionState {
  return {
    sessionId: input.sessionId,
    updatedAt: input.updatedAt,
  };
}

export function startNewProjectIrisSession(input: {
  nowIso?: string;
} = {}): ProjectIrisSessionState {
  return {
    sessionId: null,
    updatedAt: input.nowIso ?? new Date().toISOString(),
  };
}

export function loadProjectIrisSessionState(
  storage: ReadableStorage,
): ProjectIrisSessionState | null {
  try {
    const raw = storage.getItem(PROJECT_IRIS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<ProjectIrisSessionState> | null;
    if (!parsed || typeof parsed.updatedAt !== "string") {
      return null;
    }

    if (parsed.sessionId !== null && typeof parsed.sessionId !== "string") {
      return null;
    }

    return createProjectIrisSessionState({
      sessionId: parsed.sessionId ?? null,
      updatedAt: parsed.updatedAt,
    });
  } catch {
    return null;
  }
}

export function persistProjectIrisSessionState(
  storage: WritableStorage,
  state: ProjectIrisSessionState,
): void {
  storage.setItem(PROJECT_IRIS_STORAGE_KEY, JSON.stringify(state));
}

export function clearProjectIrisSessionState(storage: RemovableStorage): void {
  storage.removeItem(PROJECT_IRIS_STORAGE_KEY);
}