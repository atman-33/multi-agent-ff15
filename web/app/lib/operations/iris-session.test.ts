import { describe, expect, it } from "vitest";
import {
  buildOperationsIrisContextKey,
  createOperationsIrisSessionState,
  loadOperationsIrisSessionState,
  OPERATIONS_IRIS_STORAGE_KEY,
  persistOperationsIrisSessionState,
  shouldPromptForOperationsIrisReset,
  startNewOperationsIrisSession,
} from "./iris-session";

describe("operations iris-session", () => {
  it("restores a valid persisted Iris session state from storage", () => {
    const storage = {
      getItem: (key: string) =>
        key === OPERATIONS_IRIS_STORAGE_KEY
          ? JSON.stringify({
              contextKey: "noctis_team::builtin",
              sessionId: "session-iris-1",
              updatedAt: "2026-04-16T10:00:00.000Z",
            })
          : null,
    };

    expect(loadOperationsIrisSessionState(storage)).toEqual({
      contextKey: "noctis_team::builtin",
      sessionId: "session-iris-1",
      updatedAt: "2026-04-16T10:00:00.000Z",
    });
  });

  it("persists the current Iris session state back to storage", () => {
    let writtenKey: string | null = null;
    let writtenValue: string | null = null;
    const storage = {
      setItem: (key: string, value: string) => {
        writtenKey = key;
        writtenValue = value;
      },
    };
    const state = createOperationsIrisSessionState({
      contextKey: buildOperationsIrisContextKey({
        scope: "lunafreya",
        targetValue: "project:alpha",
      }),
      sessionId: "session-iris-2",
      updatedAt: "2026-04-16T11:00:00.000Z",
    });

    persistOperationsIrisSessionState(storage, state);

    expect(writtenKey).toBe(OPERATIONS_IRIS_STORAGE_KEY);
    expect(writtenValue).toBe(
      JSON.stringify({
        contextKey: "lunafreya::project:alpha",
        sessionId: "session-iris-2",
        updatedAt: "2026-04-16T11:00:00.000Z",
      }),
    );
  });

  it("prompts for a new session only when a different context has an active Iris conversation", () => {
    expect(
      shouldPromptForOperationsIrisReset({
        currentState: createOperationsIrisSessionState({
          contextKey: "noctis_team::builtin",
          sessionId: "session-iris-1",
          updatedAt: "2026-04-16T10:00:00.000Z",
        }),
        nextContextKey: "noctis_team::project:alpha",
      }),
    ).toBe(true);

    expect(
      shouldPromptForOperationsIrisReset({
        currentState: createOperationsIrisSessionState({
          contextKey: "noctis_team::builtin",
          sessionId: null,
          updatedAt: "2026-04-16T10:00:00.000Z",
        }),
        nextContextKey: "noctis_team::project:alpha",
      }),
    ).toBe(false);

    expect(
      shouldPromptForOperationsIrisReset({
        currentState: createOperationsIrisSessionState({
          contextKey: "noctis_team::builtin",
          sessionId: "session-iris-1",
          updatedAt: "2026-04-16T10:00:00.000Z",
        }),
        nextContextKey: "noctis_team::builtin",
      }),
    ).toBe(false);
  });

  it("starts a new session without deleting the current Studio context", () => {
    expect(
      startNewOperationsIrisSession({
        contextKey: "lunafreya::project:alpha",
        nowIso: "2026-04-16T12:00:00.000Z",
      }),
    ).toEqual({
      contextKey: "lunafreya::project:alpha",
      sessionId: null,
      updatedAt: "2026-04-16T12:00:00.000Z",
    });
  });
});