import { describe, expect, it } from "vitest";
import {
  buildOperationStudioIrisContextKey,
  createOperationStudioIrisSessionState,
  loadOperationStudioIrisSessionState,
  OPERATION_STUDIO_IRIS_STORAGE_KEY,
  persistOperationStudioIrisSessionState,
  shouldPromptForOperationStudioIrisReset,
  startNewOperationStudioIrisSession,
} from "./iris-session";

describe("operation-studio iris-session", () => {
  it("restores a valid persisted Iris session state from storage", () => {
    const storage = {
      getItem: (key: string) =>
        key === OPERATION_STUDIO_IRIS_STORAGE_KEY
          ? JSON.stringify({
              contextKey: "noctis_team::builtin",
              sessionId: "session-iris-1",
              updatedAt: "2026-04-16T10:00:00.000Z",
            })
          : null,
    };

    expect(loadOperationStudioIrisSessionState(storage)).toEqual({
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
    const state = createOperationStudioIrisSessionState({
      contextKey: buildOperationStudioIrisContextKey({
        scope: "lunafreya",
        targetValue: "project:alpha",
      }),
      sessionId: "session-iris-2",
      updatedAt: "2026-04-16T11:00:00.000Z",
    });

    persistOperationStudioIrisSessionState(storage, state);

    expect(writtenKey).toBe(OPERATION_STUDIO_IRIS_STORAGE_KEY);
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
      shouldPromptForOperationStudioIrisReset({
        currentState: createOperationStudioIrisSessionState({
          contextKey: "noctis_team::builtin",
          sessionId: "session-iris-1",
          updatedAt: "2026-04-16T10:00:00.000Z",
        }),
        nextContextKey: "noctis_team::project:alpha",
      }),
    ).toBe(true);

    expect(
      shouldPromptForOperationStudioIrisReset({
        currentState: createOperationStudioIrisSessionState({
          contextKey: "noctis_team::builtin",
          sessionId: null,
          updatedAt: "2026-04-16T10:00:00.000Z",
        }),
        nextContextKey: "noctis_team::project:alpha",
      }),
    ).toBe(false);

    expect(
      shouldPromptForOperationStudioIrisReset({
        currentState: createOperationStudioIrisSessionState({
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
      startNewOperationStudioIrisSession({
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