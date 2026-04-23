// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageInfo } from "@/lib/opencode-session-types";
import { useChatStore } from "@/stores/chat-store";
import {
  type MissionResumePayload,
  useAgentSession,
  withMissionStartPending,
} from "./use-agent-session";

type MockResponse = Pick<Response, "json" | "ok" | "status">;

type HookProbeSnapshot = {
  historyPhase: string;
  isLoadingHistory: boolean;
  abortSettlementPhase: string;
  messages: string[];
  abort: () => Promise<void>;
  send: ReturnType<typeof useAgentSession>["send"];
};

class MockEventSource {
  static instances: MockEventSource[] = [];

  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  onmessage: ((this: EventSource, ev: MessageEvent<string>) => unknown) | null = null;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close(): void {
    // No-op for tests.
  }
}

function createJsonResponse(data: unknown, init?: { ok?: boolean; status?: number }): MockResponse {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => data,
  };
}

function createDeferredResponse() {
  let resolveRef: ((response: MockResponse) => void) | undefined;
  let rejectRef: ((error?: unknown) => void) | undefined;
  const promise = new Promise<MockResponse>((nextResolve, nextReject) => {
    resolveRef = nextResolve;
    rejectRef = nextReject;
  });

  const resolve = (response: MockResponse) => {
    if (!resolveRef) {
      throw new Error("Deferred response was not initialized.");
    }
    resolveRef(response);
  };

  const reject = (error?: unknown) => {
    if (!rejectRef) {
      throw new Error("Deferred response was not initialized.");
    }
    rejectRef(error);
  };

  return {
    promise,
    reject,
    resolve,
  };
}

function createMission(overrides: Partial<MissionResumePayload> = {}): MissionResumePayload {
  return {
    missionId: overrides.missionId ?? "mission-1",
    title: overrides.title ?? "Mission",
    createdAt: overrides.createdAt ?? "2026-04-19T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-19T00:00:00.000Z",
    status: overrides.status ?? "active",
    surfaceId: overrides.surfaceId ?? "noctis_team",
    primaryAgentId: overrides.primaryAgentId ?? "noctis",
    primarySessionId: overrides.primarySessionId ?? "session-1",
    executionProjectId: overrides.executionProjectId ?? "core-repo",
    executionTargetMode: overrides.executionTargetMode ?? "execution_project",
    contextProjectIds: overrides.contextProjectIds ?? [],
    sessions: overrides.sessions ?? {
      primary: overrides.primarySessionId ?? "session-1",
      noctis: overrides.primarySessionId ?? "session-1",
      ignis: null,
      gladiolus: null,
      prompto: null,
    },
    operationState: overrides.operationState ?? null,
    workflowProgress: overrides.workflowProgress ?? null,
    activityLog: overrides.activityLog ?? [],
    ...overrides,
  };
}

function createRuntimePayload(mission: MissionResumePayload) {
  return {
    ...mission,
    banterTimeline: [],
    contextUsageByAgent: {},
    delegationLedger: null,
    sessionStatuses: mission.primarySessionId ? { [mission.primarySessionId]: "idle" } : {},
  };
}

function createAssistantMessage(id: string, text: string): MessageInfo {
  return {
    info: {
      id,
      role: "assistant",
      time: { created: Date.parse("2026-04-19T00:00:00.000Z") },
    },
    parts: [{ type: "text", text }],
  };
}

function createAbortedAssistantMessage(id: string): MessageInfo {
  return {
    info: {
      id,
      role: "assistant",
      error: {
        name: "MessageAbortedError",
        message: "Aborted",
      },
      time: { created: Date.parse("2026-04-19T00:00:00.000Z") },
    },
    parts: [],
  };
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(predicate: () => boolean, attempts = 10): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    await flushEffects();
    if (predicate()) {
      return;
    }
  }

  throw new Error("Condition was not met before timeout.");
}

function resetChatStore(): void {
  useChatStore.setState({
    agentModels: {},
    currentSessionId: null,
    optimisticSessionStates: {},
    pendingMissionSessions: {},
    selectedAgent: null,
    selectedModel: null,
    serverSessionStates: {},
    sessionDrafts: {},
    sessionStates: {},
    streamingContent: "",
    streamingMessageId: null,
    workingParty: {
      ignis: true,
      gladiolus: true,
      prompto: true,
    },
  });
}

function HookProbe({
  activeMissionId,
  initialMessageInfos,
  initialMissionData,
  onSnapshot,
}: {
  activeMissionId: string | null;
  initialMessageInfos?: MessageInfo[] | null;
  initialMissionData?: MissionResumePayload | null;
  onSnapshot: (snapshot: HookProbeSnapshot) => void;
}) {
  const state = useAgentSession({
    activeMissionId,
    initialMessageInfos,
    initialMissionData,
  });

  useEffect(() => {
    onSnapshot({
      historyPhase: state.historyPhase,
      isLoadingHistory: state.isLoadingHistory,
      abortSettlementPhase: state.abortSettlementPhase,
      messages: state.messages.map((message) => message.content),
      abort: state.abort,
      send: state.send,
    });
  }, [
    onSnapshot,
    state.abort,
    state.abortSettlementPhase,
    state.historyPhase,
    state.isLoadingHistory,
    state.messages,
    state.send,
  ]);

  return null;
}

describe("withMissionStartPending", () => {
  it("clears pending after a successful mission start", async () => {
    const setPending = vi.fn();

    const result = await withMissionStartPending(setPending, async () => "mission-1");

    expect(result).toBe("mission-1");
    expect(setPending.mock.calls).toEqual([[true], [false]]);
  });

  it("clears pending after a failed mission start", async () => {
    const setPending = vi.fn();

    await expect(
      withMissionStartPending(setPending, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(setPending.mock.calls).toEqual([[true], [false]]);
  });
});

describe("useAgentSession", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    MockEventSource.instances = [];
    resetChatStore();
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("suppresses the previous mission transcript while the next mission transcript is still loading", async () => {
    const missionOne = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const missionTwo = createMission({ missionId: "mission-2", primarySessionId: "session-2" });
    const deferredSessionTwo = createDeferredResponse();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(missionOne));
      }

      if (url === "/api/noctis/missions/mission-2/runtime") {
        return createJsonResponse(createRuntimePayload(missionTwo));
      }

      if (url === "/api/session/session-1") {
        return createJsonResponse({
          messages: [createAssistantMessage("message-1", "Mission one reply")],
        });
      }

      if (url === "/api/session/session-2") {
        return deferredSessionTwo.promise;
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    let latestSnapshot: HookProbeSnapshot | null = null;
    const missionOnePreloadedMessages = [createAssistantMessage("message-1", "Mission one reply")];

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos: missionOnePreloadedMessages,
          initialMissionData: missionOne,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });
    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      messages: ["Mission one reply"],
    });

    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-2",
          initialMissionData: missionTwo,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });
    await waitFor(() => latestSnapshot?.historyPhase === "loading");

    expect(latestSnapshot).toMatchObject({
      historyPhase: "loading",
      isLoadingHistory: true,
      messages: [],
    });

    deferredSessionTwo.resolve(
      createJsonResponse({ messages: [createAssistantMessage("message-2", "Mission two reply")] }),
    );
    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      messages: ["Mission two reply"],
    });
  });

  it("treats a preloaded active mission transcript as ready immediately", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    let latestSnapshot: HookProbeSnapshot | null = null;

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos: [createAssistantMessage("message-1", "Mission one reply")],
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });
    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      messages: ["Mission one reply"],
    });
  });

  it("surfaces top-level assistant errors from the mission transcript", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    let latestSnapshot: HookProbeSnapshot | null = null;

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos: [createAbortedAssistantMessage("message-error-1")],
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });
    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      messages: ["Response interrupted: Aborted"],
    });
  });

  it("preserves the current transcript on same-mission rerenders", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      if (url === "/api/session/session-1") {
        return createJsonResponse({
          messages: [createAssistantMessage("message-1", "Mission one reply")],
        });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    let latestSnapshot: HookProbeSnapshot | null = null;

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos: [createAssistantMessage("message-1", "Mission one reply")],
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });
    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });
    await flushEffects();

    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      messages: ["Mission one reply"],
    });
  });

  it("enters abort settlement after abort succeeds and before idle is confirmed", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      if (url === "/api/session/session-1/abort") {
        return createJsonResponse({ ok: true });
      }

      if (url === "/api/session/session-1") {
        return createJsonResponse({
          messages: [createAbortedAssistantMessage("message-error-1")],
        });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    useChatStore.getState().setServerSessionState("session-1", "busy");

    let latestSnapshot: HookProbeSnapshot | null = null;

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos: [createAssistantMessage("message-1", "Mission one reply")],
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });
    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    await act(async () => {
      await latestSnapshot?.abort();
    });

    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      abortSettlementPhase: "settling",
      messages: ["Response interrupted: Aborted"],
    });
  });

  it("clears abort settlement when runtime polling later confirms idle", async () => {
    vi.useFakeTimers();

    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    let runtimeStatus: "busy" | null = "busy";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse({
          ...createRuntimePayload(mission),
          sessionStatuses: runtimeStatus ? { "session-1": runtimeStatus } : {},
        });
      }

      if (url === "/api/session/session-1/abort") {
        return createJsonResponse({ ok: true });
      }

      if (url === "/api/session/session-1") {
        return createJsonResponse({
          messages: [createAbortedAssistantMessage("message-error-1")],
        });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    let latestSnapshot: HookProbeSnapshot | null = null;

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos: [createAssistantMessage("message-1", "Mission one reply")],
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });
    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    await act(async () => {
      await latestSnapshot?.abort();
    });

    if (!latestSnapshot) {
      throw new Error("Expected hook snapshot after abort.");
    }

    const settledSnapshot: HookProbeSnapshot = latestSnapshot;
    expect(settledSnapshot.abortSettlementPhase).toBe("settling");

    runtimeStatus = null;
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    await waitFor(() => {
      if (!latestSnapshot) {
        return false;
      }

      return latestSnapshot.abortSettlementPhase === "idle";
    });
  });

  it("escalates abort settlement to delayed after a prolonged wait", async () => {
    vi.useFakeTimers();

    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse({
          ...createRuntimePayload(mission),
          sessionStatuses: { "session-1": "busy" },
        });
      }

      if (url === "/api/session/session-1/abort") {
        return createJsonResponse({ ok: true });
      }

      if (url === "/api/session/session-1") {
        return createJsonResponse({
          messages: [createAbortedAssistantMessage("message-error-1")],
        });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    let latestSnapshot: HookProbeSnapshot | null = null;

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos: [createAssistantMessage("message-1", "Mission one reply")],
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });
    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    await act(async () => {
      await latestSnapshot?.abort();
    });

    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });
    await waitFor(() => {
      if (!latestSnapshot) {
        return false;
      }

      return latestSnapshot.abortSettlementPhase === "delayed";
    });
  });

  it("keeps resend on the existing mission continue path after abort settlement", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    let sessionMessages: MessageInfo[] = [createAssistantMessage("message-1", "Mission one reply")];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      if (url === "/api/session/session-1/abort") {
        sessionMessages = [createAbortedAssistantMessage("message-error-1")];
        return createJsonResponse({ ok: true });
      }

      if (url === "/api/noctis/mission/continue") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { missionId?: string };
        expect(body.missionId).toBe("mission-1");
        sessionMessages = [createAssistantMessage("message-2", "Follow-up reply")];
        return createJsonResponse({ noctisSessionId: "session-1" });
      }

      if (url === "/api/session/session-1") {
        return createJsonResponse({ messages: sessionMessages });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    let latestSnapshot: HookProbeSnapshot | null = null;

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos: [createAssistantMessage("message-1", "Mission one reply")],
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });
    await waitFor(() => latestSnapshot?.historyPhase === "ready");
    await waitFor(() => MockEventSource.instances.length > 0);

    await act(async () => {
      await latestSnapshot?.abort();
    });

    const sessionEventSource = MockEventSource.instances.at(-1);
    await act(async () => {
      sessionEventSource?.onmessage?.call(
        sessionEventSource as unknown as EventSource,
        new MessageEvent("message", {
          data: JSON.stringify({ type: "session.idle" }),
        }),
      );
    });

    await act(async () => {
      await latestSnapshot?.send([{ type: "text", text: "Retry request" }]);
    });

    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/noctis/mission/start")).toBe(
      false,
    );
    expect(
      fetchMock.mock.calls.some(([input]) => String(input) === "/api/noctis/mission/continue"),
    ).toBe(true);
  });
});