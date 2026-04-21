import { describe, expect, it } from "vitest";
import {
  createProjectIrisSessionState,
  loadProjectIrisSessionState,
  persistProjectIrisSessionState,
  PROJECT_IRIS_STORAGE_KEY,
  startNewProjectIrisSession,
} from "./iris-session";

describe("project-management iris-session", () => {
  it("restores a valid persisted Projects Iris session state when the sheet or page reopens", () => {
    const storage = {
      getItem: (key: string) =>
        key === PROJECT_IRIS_STORAGE_KEY
          ? JSON.stringify({
              sessionId: "session-project-iris-1",
              updatedAt: "2026-04-21T10:00:00.000Z",
            })
          : null,
    };

    expect(loadProjectIrisSessionState(storage)).toEqual({
      sessionId: "session-project-iris-1",
      updatedAt: "2026-04-21T10:00:00.000Z",
    });
  });

  it("persists the current Projects Iris session state back to storage", () => {
    let writtenKey: string | null = null;
    let writtenValue: string | null = null;
    const storage = {
      setItem: (key: string, value: string) => {
        writtenKey = key;
        writtenValue = value;
      },
    };

    persistProjectIrisSessionState(
      storage,
      createProjectIrisSessionState({
        sessionId: "session-project-iris-2",
        updatedAt: "2026-04-21T11:00:00.000Z",
      }),
    );

    expect(writtenKey).toBe(PROJECT_IRIS_STORAGE_KEY);
    expect(writtenValue).toBe(
      JSON.stringify({
        sessionId: "session-project-iris-2",
        updatedAt: "2026-04-21T11:00:00.000Z",
      }),
    );
  });

  it("starts a new Projects Iris session with no attached session id", () => {
    expect(
      startNewProjectIrisSession({
        nowIso: "2026-04-21T12:00:00.000Z",
      }),
    ).toEqual({
      sessionId: null,
      updatedAt: "2026-04-21T12:00:00.000Z",
    });
  });
});