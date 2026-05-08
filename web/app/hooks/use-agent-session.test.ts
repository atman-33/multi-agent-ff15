// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageInfo } from "@/lib/opencode-session-types";
import { useChatStore } from "@/stores/chat-store";
import {
  getMissionRuntimePollInterval,
  type MissionResumePayload,
  useAgentSession,
  withMissionStartPending,
} from "./use-agent-session";

type MockResponse = Pick<Response, "json" | "ok" | "status">;

type HookProbeSnapshot = {
  banterMessages: string[];
  liveDraft: {
    messageId: string | null;
    parts: Array<{ text?: string; type: string }>;
    sessionId: string | null;
  } | null;
  historyPhase: string;
  isSessionActive: boolean;
  isLoadingHistory: boolean;
  isStreaming: boolean;
  abortSettlementPhase: string;
  messages: string[];
  retainedHistory: {
    isActive: boolean;
    trimmedConversationUnitCount: number;
    trimmedMessageCount: number;
  };
  streamingContent: string;
  abort: () => Promise<void>;
  send: ReturnType<typeof useAgentSession>["send"];
};

class MockEventSource {
  static instances: MockEventSource[] = [];
  closed = false;

  onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  onmessage: ((this: EventSource, ev: MessageEvent<string>) => unknown) | null = null;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
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

function stubMissionRuntimeFetch(mission: MissionResumePayload) {
  const missionRouteBase =
    mission.surfaceId === "lunafreya" || mission.primaryAgentId === "lunafreya"
      ? "/api/lunafreya/missions"
      : "/api/noctis/missions";
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (missionRouteBase === "/api/noctis/missions" && url.startsWith("/api/noctis/operations")) {
      return createJsonResponse({ operations: [] });
    }

    if (url === `${missionRouteBase}/${mission.missionId}/runtime`) {
      return createJsonResponse(createRuntimePayload(mission));
    }

    throw new Error(`Unhandled fetch: ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function createAssistantMessage(id: string, text: string, agent?: string): MessageInfo {
  return {
    info: {
      id,
      role: "assistant",
      agent,
      time: { created: Date.parse("2026-04-19T00:00:00.000Z") },
    },
    parts: [{ type: "text", text }],
  };
}

function createUserMessage(id: string, text: string): MessageInfo {
  return {
    info: {
      id,
      role: "user",
      time: { created: Date.parse("2026-04-19T00:00:00.000Z") },
    },
    parts: [{ type: "text", text }],
  };
}

function createAssistantMessages(count: number, prefix = "Reply"): MessageInfo[] {
  return Array.from({ length: count }, (_, index) =>
    createAssistantMessage(`message-${index + 1}`, `${prefix} ${index + 1}`),
  );
}

function createAssistantToolMessage(id: string, agent?: string): MessageInfo {
  return {
    info: {
      id,
      role: "assistant",
      agent,
      time: { created: Date.parse("2026-04-19T00:00:00.000Z") },
    },
    parts: [{ type: "tool", tool: "bash", state: { status: "completed" } }],
  };
}

function createAbortedAssistantMessage(id: string, agent?: string): MessageInfo {
  return {
    info: {
      id,
      role: "assistant",
      agent,
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

function requireSnapshot(snapshot: HookProbeSnapshot | null, message: string): HookProbeSnapshot {
  if (!snapshot) {
    throw new Error(message);
  }

  return snapshot;
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
  selectedExecutionProjectId,
}: {
  activeMissionId: string | null;
  initialMessageInfos?: MessageInfo[] | null;
  initialMissionData?: MissionResumePayload | null;
  onSnapshot: (snapshot: HookProbeSnapshot) => void;
  selectedExecutionProjectId?: string;
}) {
  const state = useAgentSession({
    activeMissionId,
    initialMessageInfos,
    initialMissionData,
    selectedExecutionProjectId,
  });

  useEffect(() => {
    onSnapshot({
      banterMessages: state.banterEntries.map((entry) => entry.message),
      liveDraft: state.liveDraft,
      historyPhase: state.historyPhase,
      isSessionActive: state.isSessionActive,
      isLoadingHistory: state.isLoadingHistory,
      isStreaming: state.isStreaming,
      abortSettlementPhase: state.abortSettlementPhase,
      messages: state.messages.map((message) => message.content),
      retainedHistory: state.retainedHistory,
      streamingContent: state.streamingContent,
      abort: state.abort,
      send: state.send,
    });
  }, [
    onSnapshot,
    state.abort,
    state.abortSettlementPhase,
    state.banterEntries,
    state.historyPhase,
    state.isSessionActive,
    state.isLoadingHistory,
    state.isStreaming,
    state.liveDraft,
    state.messages,
    state.retainedHistory,
    state.streamingContent,
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

  it("uses a fast runtime polling cadence while a visible mission transcript is pending", () => {
    expect(
      getMissionRuntimePollInterval({
        abortSettlementPhase: "idle",
        hasActiveDelegation: false,
        hasPendingTranscript: true,
        isDocumentVisible: true,
        isPrimaryStreamConnected: true,
        isSessionActive: false,
        isStreaming: false,
      }),
    ).toBe(3000);
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
      streamingContent: "",
    });

    await waitFor(
      () =>
        MockEventSource.instances.some(
          (instance) => instance.url === "/api/session/session-2/events",
        ),
    );

    const sessionTwoEventSource = MockEventSource.instances.find(
      (instance) => instance.url === "/api/session/session-2/events",
    );
    await waitFor(() => typeof sessionTwoEventSource?.onmessage === "function");
    const handleSessionTwoMessage = sessionTwoEventSource?.onmessage;

    await act(async () => {
      handleSessionTwoMessage?.call(
        sessionTwoEventSource as unknown as EventSource,
        {
          data: JSON.stringify({
            properties: {
              part: {
                messageID: "message-2",
                sessionID: "session-2",
                text: "Mission two is responding",
                type: "text",
              },
            },
            type: "message.part.updated",
          }),
        } as MessageEvent<string>,
      );
    });

    await waitFor(() => latestSnapshot?.streamingContent === "Mission two is responding");

    expect(latestSnapshot).toMatchObject({
      historyPhase: "loading",
      isLoadingHistory: true,
      messages: [],
      streamingContent: "Mission two is responding",
    });

    deferredSessionTwo.resolve(
      createJsonResponse({ messages: [createAssistantMessage("message-2", "Mission two reply")] }),
    );
    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      messages: ["Mission two reply"],
      streamingContent: "",
    });
  });

  it("retains only the most recent mission transcript window when preloaded history exceeds the cap", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const preloadedMessages = createAssistantMessages(170);
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
          initialMessageInfos: preloadedMessages,
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await waitFor(() => latestSnapshot?.historyPhase === "ready");
    const readySnapshot = requireSnapshot(latestSnapshot, "Expected preloaded retention snapshot.");

    expect(readySnapshot.messages).toHaveLength(120);
    expect(readySnapshot.messages[0]).toBe("Reply 51");
    expect(readySnapshot.messages.at(-1)).toBe("Reply 170");
    expect(readySnapshot.retainedHistory).toEqual({
      isActive: true,
      trimmedConversationUnitCount: 50,
      trimmedMessageCount: 50,
    });
  });

  it("retains only the most recent mission transcript window after authoritative history sync", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const persistedMessages = createAssistantMessages(170);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      if (url === "/api/session/session-1") {
        return createJsonResponse({ messages: persistedMessages });
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
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await waitFor(() => latestSnapshot?.historyPhase === "ready");
    const readySnapshot = requireSnapshot(latestSnapshot, "Expected synced retention snapshot.");

    expect(readySnapshot.messages).toHaveLength(120);
    expect(readySnapshot.messages[0]).toBe("Reply 51");
    expect(readySnapshot.messages.at(-1)).toBe("Reply 170");
    expect(readySnapshot.retainedHistory).toEqual({
      isActive: true,
      trimmedConversationUnitCount: 50,
      trimmedMessageCount: 50,
    });
  });

  it("retains complete conversation units when grouped assistant activity crosses the cap", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const preloadedMessages = [
      ...createAssistantMessages(160),
      createAssistantToolMessage("message-161"),
      createAssistantMessage("message-162", "Grouped reply"),
    ];
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
          initialMessageInfos: preloadedMessages,
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await waitFor(() => latestSnapshot?.historyPhase === "ready");
    const readySnapshot = requireSnapshot(
      latestSnapshot,
      "Expected grouped retention snapshot.",
    );

    expect(readySnapshot.messages).toHaveLength(121);
    expect(readySnapshot.messages[0]).toBe("Reply 42");
    expect(readySnapshot.messages.slice(-2)).toEqual(["", "Grouped reply"]);
    expect(readySnapshot.retainedHistory).toEqual({
      isActive: true,
      trimmedConversationUnitCount: 41,
      trimmedMessageCount: 41,
    });
  });

  it("clears retained-history mode when transcript ownership changes to a new mission", async () => {
    const missionOne = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const missionTwo = createMission({ missionId: "mission-2", primarySessionId: "session-2" });
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

      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    let latestSnapshot: HookProbeSnapshot | null = null;

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos: createAssistantMessages(170),
          initialMissionData: missionOne,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await waitFor(() => latestSnapshot?.historyPhase === "ready");
    const firstMissionSnapshot = requireSnapshot(
      latestSnapshot,
      "Expected first mission retention snapshot.",
    );

    expect(firstMissionSnapshot.retainedHistory.isActive).toBe(true);

    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-2",
          initialMessageInfos: [createAssistantMessage("message-201", "Mission two reply")],
          initialMissionData: missionTwo,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await waitFor(() => latestSnapshot?.historyPhase === "ready");
    const secondMissionSnapshot = requireSnapshot(
      latestSnapshot,
      "Expected second mission retention snapshot.",
    );

    expect(secondMissionSnapshot.messages).toEqual(["Mission two reply"]);
    expect(secondMissionSnapshot.retainedHistory).toEqual({
      isActive: false,
      trimmedConversationUnitCount: 0,
      trimmedMessageCount: 0,
    });
  });

  it("preserves the last visible mission transcript while the same mission rehydrates a new primary session in the background", async () => {
    const initialMission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const runtimeMission = createMission({ missionId: "mission-1", primarySessionId: "session-2" });
    const deferredSessionTwo = createDeferredResponse();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(runtimeMission));
      }

      if (url === "/api/session/session-2") {
        return deferredSessionTwo.promise;
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    let latestSnapshot: HookProbeSnapshot | null = null;
    const initialMessages = [createAssistantMessage("message-1", "Mission one reply")];

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos: initialMessages,
          initialMissionData: initialMission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await waitFor(
      () =>
        fetchMock.mock.calls.some(([input]) => String(input) === "/api/session/session-2"),
    );

    expect(latestSnapshot).toMatchObject({
      historyPhase: "loading",
      isLoadingHistory: false,
      messages: ["Mission one reply"],
      streamingContent: "",
    });
  });

  it("keeps the live mission reply visible while a busy history sync resolves with stale history", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const deferredSession = createDeferredResponse();
    let sessionLoadCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      if (url === "/api/noctis/mission/continue") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { missionId?: string };
        expect(body.missionId).toBe("mission-1");
        return createJsonResponse({ noctisSessionId: "session-1" });
      }

      if (url === "/api/session/session-1") {
        sessionLoadCount += 1;

        if (sessionLoadCount === 1) {
          return deferredSession.promise;
        }

        return createJsonResponse({
          messages: [
            createAssistantMessage("message-1", "Mission one reply"),
            createAssistantMessage("message-2", "Mission one follow-up reply"),
          ],
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
    await waitFor(
      () =>
        MockEventSource.instances.some(
          (instance) => instance.url === "/api/session/session-1/events",
        ),
    );

    const sessionEventSource = MockEventSource.instances.find(
      (instance) => instance.url === "/api/session/session-1/events",
    );
    await waitFor(() => typeof sessionEventSource?.onmessage === "function");

    await act(async () => {
      await latestSnapshot?.send([{ type: "text", text: "Continue mission" }]);
    });

    await waitFor(
      () =>
        fetchMock.mock.calls.some(([input]) => String(input) === "/api/session/session-1"),
    );
    await waitFor(() => useChatStore.getState().sessionStates["session-1"] === "busy");

    await act(async () => {
      sessionEventSource?.onmessage?.call(
        sessionEventSource as unknown as EventSource,
        new MessageEvent("message", {
          data: JSON.stringify({
            properties: {
              sessionID: "session-1",
              status: {
                type: "busy",
              },
            },
            type: "session.status",
          }),
        }),
      );
    });

    await act(async () => {
      sessionEventSource?.onmessage?.call(
        sessionEventSource as unknown as EventSource,
        new MessageEvent("message", {
          data: JSON.stringify({
            properties: {
              part: {
                messageID: "message-2",
                sessionID: "session-1",
                text: "Mission one is responding",
                type: "text",
              },
            },
            type: "message.part.updated",
          }),
        }),
      );
    });

    await waitFor(() => latestSnapshot?.streamingContent === "Mission one is responding");

    deferredSession.resolve(
      createJsonResponse({
        messages: [createAssistantMessage("message-1", "Mission one reply")],
      }),
    );

    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      messages: ["Mission one reply"],
      streamingContent: "Mission one is responding",
    });

    await act(async () => {
      sessionEventSource?.onmessage?.call(
        sessionEventSource as unknown as EventSource,
        new MessageEvent("message", {
          data: JSON.stringify({
            properties: {
              sessionID: "session-1",
            },
            type: "session.idle",
          }),
        }),
      );
    });

    await waitFor(
      () => latestSnapshot?.historyPhase === "ready" && latestSnapshot?.streamingContent === "",
    );

    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      isStreaming: false,
      messages: ["Mission one reply", "Mission one follow-up reply"],
      streamingContent: "",
    });
  });

  it("keeps only the final visible assistant reply for a sender in compact mission history", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const initialMessageInfos = [
      createUserMessage("user-1", "Please revise the PR body."),
      createAssistantToolMessage("assistant-tool-1"),
      createAssistantMessage("assistant-visible-1", "Revised the PR body."),
    ];
    stubMissionRuntimeFetch(mission);

    let latestSnapshot: HookProbeSnapshot | null = null;

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos,
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
      messages: ["Please revise the PR body.", "Revised the PR body."],
    });
  });

  it("keeps a critical assistant outcome alongside a later visible reply in compact mission history", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    stubMissionRuntimeFetch(mission);

    let latestSnapshot: HookProbeSnapshot | null = null;

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos: [
            createUserMessage("user-1", "Try again."),
            createAbortedAssistantMessage("assistant-aborted-1"),
            createAssistantMessage("assistant-visible-1", "Recovered and completed the retry."),
          ],
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
      messages: [
        "Try again.",
        "Response interrupted: Aborted",
        "Recovered and completed the retry.",
      ],
    });
  });

  it("keeps the final visible reply for each assistant sender in the same compact mission turn", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    stubMissionRuntimeFetch(mission);

    let latestSnapshot: HookProbeSnapshot | null = null;

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos: [
            createUserMessage("user-1", "Coordinate the update."),
            createAssistantToolMessage("assistant-tool-noctis-1"),
            createAssistantMessage("assistant-ignis-1", "Ignis verified the affected files.", "ignis"),
            createAssistantMessage("assistant-noctis-1", "I applied the requested update.", "noctis"),
          ],
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
      messages: [
        "Coordinate the update.",
        "Ignis verified the affected files.",
        "I applied the requested update.",
      ],
    });
  });

  it("keeps a single fallback assistant row when a compact mission turn has only intermediate activity", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    stubMissionRuntimeFetch(mission);

    let latestSnapshot: HookProbeSnapshot | null = null;

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos: [
            createUserMessage("user-1", "Check the current status."),
            createAssistantToolMessage("assistant-tool-1"),
            createAssistantToolMessage("assistant-tool-2"),
          ],
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
      messages: ["Check the current status.", ""],
    });
  });

  it("applies the same compact mission history rules on the Lunafreya surface", async () => {
    const mission = createMission({
      missionId: "mission-luna-1",
      primarySessionId: "session-luna-1",
      surfaceId: "lunafreya",
      primaryAgentId: "lunafreya",
      sessions: {
        primary: "session-luna-1",
        noctis: null,
        ignis: null,
        gladiolus: null,
        prompto: null,
      },
    });
    stubMissionRuntimeFetch(mission);

    let latestSnapshot: HookProbeSnapshot | null = null;

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-luna-1",
          initialMessageInfos: [
            createUserMessage("user-1", "Summarize the latest notes."),
            createAssistantToolMessage("assistant-tool-1", "lunafreya"),
            createAssistantMessage(
              "assistant-visible-1",
              "I condensed the notes into a concise summary.",
              "lunafreya",
            ),
          ],
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
      messages: ["Summarize the latest notes.", "I condensed the notes into a concise summary."],
    });
  });

  it("requests compact transcript payloads for mission session history", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      if (url === "/api/session/session-1") {
        const headers = init?.headers;
        const detailState =
          headers instanceof Headers
            ? headers.get("x-session-detail-state")
            : Array.isArray(headers)
              ? (headers.find(([name]) => name === "x-session-detail-state")?.[1] ?? null)
              : (headers?.["x-session-detail-state" as keyof typeof headers] ?? null);

        return createJsonResponse({
          messages: [
            detailState === "summary"
              ? {
                  info: {
                    id: "message-1",
                    role: "assistant",
                    time: { created: Date.parse("2026-04-19T00:00:00.000Z") },
                  },
                  detailState: "summary",
                  summary: {
                    content: "**Analyzing PR content update**",
                    detailContent: [
                      "**Analyzing PR content update**",
                      "",
                      "The user's request suggests updating the PR content.",
                    ].join("\n"),
                    rawText: "**Analyzing PR content update**",
                  },
                  parts: [
                    {
                      type: "tool",
                      tool: "read_file",
                      state: { status: "completed" },
                    },
                  ],
                }
              : {
                  info: {
                    id: "message-1",
                    role: "assistant",
                    time: { created: Date.parse("2026-04-19T00:00:00.000Z") },
                  },
                  parts: [
                    {
                      type: "text",
                      text: [
                        "**Analyzing PR content update**",
                        "",
                        "The user's request suggests updating the PR content.",
                      ].join("\n"),
                    },
                  ],
                },
          ],
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
      messages: ["**Analyzing PR content update**"],
    });
    expect(
      fetchMock.mock.calls.some(([, init]) => {
        const headers = init?.headers;
        if (headers instanceof Headers) {
          return headers.get("x-session-detail-state") === "summary";
        }
        if (Array.isArray(headers)) {
          return headers.some(
            ([name, value]) => name === "x-session-detail-state" && value === "summary",
          );
        }

        return headers?.["x-session-detail-state" as keyof typeof headers] === "summary";
      }),
    ).toBe(true);
  });

  it("coalesces overlapping fire-and-forget history sync requests for the same session", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const deferredSession = createDeferredResponse();
    let sessionLoadCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      if (url === "/api/noctis/mission/continue") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { missionId?: string };
        expect(body.missionId).toBe("mission-1");
        return createJsonResponse({ noctisSessionId: "session-1" });
      }

      if (url === "/api/session/session-1") {
        sessionLoadCount += 1;

        if (sessionLoadCount === 1) {
          return deferredSession.promise;
        }

        return createJsonResponse({
          messages: [
            createAssistantMessage("message-1", "Mission one reply"),
            createAssistantMessage("message-2", "Mission one follow-up reply"),
          ],
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
    await waitFor(
      () =>
        MockEventSource.instances.some(
          (instance) => instance.url === "/api/session/session-1/events",
        ),
    );

    const sessionEventSource = MockEventSource.instances.find(
      (instance) => instance.url === "/api/session/session-1/events",
    );
    await waitFor(() => typeof sessionEventSource?.onmessage === "function");

    await act(async () => {
      await latestSnapshot?.send([{ type: "text", text: "Continue mission" }]);
    });

    await waitFor(() => sessionLoadCount === 1);

    await act(async () => {
      sessionEventSource?.onmessage?.call(
        sessionEventSource as unknown as EventSource,
        new MessageEvent("message", {
          data: JSON.stringify({
            properties: {
              sessionID: "session-1",
            },
            type: "session.idle",
          }),
        }),
      );
    });

    expect(sessionLoadCount).toBe(1);
  });

  it("keeps a session-bound pending transcript state when a dispatched reply has not persisted yet", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      if (url === "/api/noctis/mission/continue") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { missionId?: string };
        expect(body.missionId).toBe("mission-1");
        return createJsonResponse({ noctisSessionId: "session-1" });
      }

      if (url === "/api/session/session-1") {
        return createJsonResponse({ messages: [] });
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
          initialMessageInfos: [],
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await flushEffects();

    await act(async () => {
      await latestSnapshot?.send([{ type: "text", text: "Continue mission" }]);
    });

    await waitFor(() => latestSnapshot?.historyPhase === "pending");

    expect(latestSnapshot).toMatchObject({
      historyPhase: "pending",
      isLoadingHistory: false,
      messages: ["Continue mission"],
      streamingContent: "",
    });
  });

  it("keeps an existing transcript pending and active while a follow-up reply has not persisted yet", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const persistedMessages = [createAssistantMessage("message-1", "Mission one reply")];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse({
          ...createRuntimePayload(mission),
          sessionStatuses: {},
        });
      }

      if (url === "/api/noctis/mission/continue") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { missionId?: string };
        expect(body.missionId).toBe("mission-1");
        return createJsonResponse({ noctisSessionId: "session-1" });
      }

      if (url === "/api/session/session-1") {
        return createJsonResponse({ messages: persistedMessages });
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
          initialMessageInfos: persistedMessages,
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await flushEffects();
    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    await act(async () => {
      await latestSnapshot?.send([{ type: "text", text: "Continue mission" }]);
    });

    await waitFor(() => latestSnapshot?.historyPhase === "pending");

    await act(async () => {
      useChatStore.getState().setOptimisticSessionState("session-1", "idle", 60_000);
    });

    expect(latestSnapshot).toMatchObject({
      historyPhase: "pending",
      isLoadingHistory: false,
      isSessionActive: true,
      messages: ["Mission one reply", "Continue mission"],
      streamingContent: "",
    });
  });

  it("settles a pending transcript when runtime polling reports the same primary session idle", async () => {
    vi.useFakeTimers();

    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    let runtimeStatus: "busy" | "idle" = "busy";
    let sessionLoadCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse({
          ...createRuntimePayload(mission),
          sessionStatuses: { "session-1": runtimeStatus },
        });
      }

      if (url === "/api/noctis/mission/continue") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { missionId?: string };
        expect(body.missionId).toBe("mission-1");
        return createJsonResponse({ noctisSessionId: "session-1" });
      }

      if (url === "/api/session/session-1") {
        sessionLoadCount += 1;

        if (sessionLoadCount < 3) {
          return createJsonResponse({ messages: [] });
        }

        return createJsonResponse({
          messages: [createAssistantMessage("message-2", "Mission one follow-up reply")],
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
          initialMessageInfos: [],
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await waitFor(() => latestSnapshot?.historyPhase === "empty");
    await waitFor(
      () =>
        MockEventSource.instances.some(
          (instance) => instance.url === "/api/session/session-1/events",
        ),
    );

    const sessionEventSource = MockEventSource.instances.find(
      (instance) => instance.url === "/api/session/session-1/events",
    );
    await waitFor(() => typeof sessionEventSource?.onopen === "function");

    await act(async () => {
      sessionEventSource?.onopen?.call(
        sessionEventSource as unknown as EventSource,
        new Event("open"),
      );
    });

    await act(async () => {
      await latestSnapshot?.send([{ type: "text", text: "Continue mission" }]);
    });

    await waitFor(() => latestSnapshot?.historyPhase === "pending");
    expect(sessionLoadCount).toBe(2);

    runtimeStatus = "idle";

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });

    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    expect(sessionLoadCount).toBe(3);
    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      messages: ["Mission one follow-up reply"],
      streamingContent: "",
    });
  });

  it("settles a pending transcript when runtime polling settles the same primary session without a status", async () => {
    vi.useFakeTimers();

    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    let sessionLoadCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse({
          ...createRuntimePayload(mission),
          sessionStatuses: {},
        });
      }

      if (url === "/api/noctis/mission/continue") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { missionId?: string };
        expect(body.missionId).toBe("mission-1");
        return createJsonResponse({ noctisSessionId: "session-1" });
      }

      if (url === "/api/session/session-1") {
        sessionLoadCount += 1;

        if (sessionLoadCount < 3) {
          return createJsonResponse({ messages: [] });
        }

        return createJsonResponse({
          messages: [createAssistantMessage("message-2", "Mission one follow-up reply")],
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
          initialMessageInfos: [],
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await waitFor(() => latestSnapshot?.historyPhase === "empty");
    await waitFor(
      () =>
        MockEventSource.instances.some(
          (instance) => instance.url === "/api/session/session-1/events",
        ),
    );

    const sessionEventSource = MockEventSource.instances.find(
      (instance) => instance.url === "/api/session/session-1/events",
    );
    await waitFor(() => typeof sessionEventSource?.onopen === "function");

    await act(async () => {
      sessionEventSource?.onopen?.call(
        sessionEventSource as unknown as EventSource,
        new Event("open"),
      );
    });

    await act(async () => {
      await latestSnapshot?.send([{ type: "text", text: "Continue mission" }]);
    });

    await waitFor(() => latestSnapshot?.historyPhase === "pending");
    expect(sessionLoadCount).toBe(2);

    await act(async () => {
      vi.advanceTimersByTime(20_000);
      await Promise.resolve();
    });

    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    expect(sessionLoadCount).toBe(3);
    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      messages: ["Mission one follow-up reply"],
      streamingContent: "",
    });
  });

  it("settles a pending transcript when runtime freshness advances without a live session event", async () => {
    vi.useFakeTimers();

    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    let sessionLoadCount = 0;
    let latestPrimaryMessageId: string | null = null;
    let latestPrimaryMessageCreatedAt: string | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse({
          ...createRuntimePayload(mission),
          latestPrimaryMessageId,
          latestPrimaryMessageCreatedAt,
          sessionStatuses: { "session-1": "busy" },
        });
      }

      if (url === "/api/noctis/mission/continue") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { missionId?: string };
        expect(body.missionId).toBe("mission-1");
        return createJsonResponse({ noctisSessionId: "session-1" });
      }

      if (url === "/api/session/session-1") {
        sessionLoadCount += 1;

        if (sessionLoadCount < 3) {
          return createJsonResponse({ messages: [] });
        }

        return createJsonResponse({
          messages: [createAssistantMessage("message-2", "Mission one follow-up reply")],
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
          initialMessageInfos: [],
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await waitFor(() => latestSnapshot?.historyPhase === "empty");

    await act(async () => {
      await latestSnapshot?.send([{ type: "text", text: "Continue mission" }]);
    });

    await waitFor(() => latestSnapshot?.historyPhase === "pending");
    expect(sessionLoadCount).toBe(2);

    latestPrimaryMessageId = "message-2";
    latestPrimaryMessageCreatedAt = "2026-04-19T00:02:00.000Z";

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    expect(sessionLoadCount).toBe(3);
    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      messages: ["Mission one follow-up reply"],
      streamingContent: "",
    });
  });

  it("clears a stale pending transcript when the same mission switches to a new primary session", async () => {
    const initialMission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    let runtimeMission = initialMission;
    const deferredSessionTwo = createDeferredResponse();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(runtimeMission));
      }

      if (url === "/api/noctis/mission/continue") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { missionId?: string };
        expect(body.missionId).toBe("mission-1");
        return createJsonResponse({ noctisSessionId: "session-1" });
      }

      if (url === "/api/session/session-1") {
        return createJsonResponse({ messages: [] });
      }

      if (url === "/api/session/session-2") {
        return deferredSessionTwo.promise;
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
          initialMessageInfos: [],
          initialMissionData: initialMission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await waitFor(() => latestSnapshot?.historyPhase === "empty");
    await waitFor(
      () =>
        MockEventSource.instances.some(
          (instance) => instance.url === "/api/session/session-1/events",
        ),
    );

    const sessionEventSource = MockEventSource.instances.find(
      (instance) => instance.url === "/api/session/session-1/events",
    );

    await act(async () => {
      await latestSnapshot?.send([{ type: "text", text: "Continue mission" }]);
    });

    await waitFor(() => latestSnapshot?.historyPhase === "pending");
    const pendingSnapshot = requireSnapshot(latestSnapshot, "Expected a pending hook snapshot.");
    expect(pendingSnapshot.messages).toEqual(["Continue mission"]);

    runtimeMission = createMission({ missionId: "mission-1", primarySessionId: "session-2" });

    await act(async () => {
      sessionEventSource?.onerror?.call(sessionEventSource as unknown as EventSource, new Event("error"));
    });

    await waitFor(
      () =>
        fetchMock.mock.calls.some(([input]) => String(input) === "/api/session/session-2"),
    );

    expect(latestSnapshot).toMatchObject({
      historyPhase: "loading",
      isLoadingHistory: true,
      messages: [],
      streamingContent: "",
    });
  });

  it("runs one queued history sync after the in-flight sync finishes", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const deferredSession = createDeferredResponse();
    let sessionLoadCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      if (url === "/api/noctis/mission/continue") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { missionId?: string };
        expect(body.missionId).toBe("mission-1");
        return createJsonResponse({ noctisSessionId: "session-1" });
      }

      if (url === "/api/session/session-1") {
        sessionLoadCount += 1;

        if (sessionLoadCount === 1) {
          return deferredSession.promise;
        }

        return createJsonResponse({
          messages: [
            createAssistantMessage("message-1", "Mission one reply"),
            createAssistantMessage("message-2", "Mission one follow-up reply"),
          ],
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
    await waitFor(
      () =>
        MockEventSource.instances.some(
          (instance) => instance.url === "/api/session/session-1/events",
        ),
    );

    const sessionEventSource = MockEventSource.instances.find(
      (instance) => instance.url === "/api/session/session-1/events",
    );
    await waitFor(() => typeof sessionEventSource?.onmessage === "function");

    await act(async () => {
      await latestSnapshot?.send([{ type: "text", text: "Continue mission" }]);
    });

    await waitFor(() => sessionLoadCount === 1);

    await act(async () => {
      sessionEventSource?.onmessage?.call(
        sessionEventSource as unknown as EventSource,
        new MessageEvent("message", {
          data: JSON.stringify({
            properties: {
              sessionID: "session-1",
            },
            type: "session.idle",
          }),
        }),
      );
    });

    deferredSession.resolve(
      createJsonResponse({
        messages: [createAssistantMessage("message-1", "Mission one reply")],
      }),
    );

    await waitFor(() => sessionLoadCount === 2);
    await waitFor(() => latestSnapshot?.messages.at(-1) === "Mission one follow-up reply");

    expect(sessionLoadCount).toBe(2);
  });

  it("clears the live tail once history includes the current streaming message while the session stays busy", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const deferredSession = createDeferredResponse();
    let firstSessionLoad = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      if (url === "/api/noctis/mission/continue") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { missionId?: string };
        expect(body.missionId).toBe("mission-1");
        return createJsonResponse({ noctisSessionId: "session-1" });
      }

      if (url === "/api/session/session-1") {
        if (firstSessionLoad) {
          firstSessionLoad = false;
          return deferredSession.promise;
        }

        return createJsonResponse({
          messages: [
            createAssistantMessage("message-1", "Mission one reply"),
            createAssistantMessage("message-2", "Mission one is responding"),
          ],
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
    await waitFor(
      () =>
        MockEventSource.instances.some(
          (instance) => instance.url === "/api/session/session-1/events",
        ),
    );

    const sessionEventSource = MockEventSource.instances.find(
      (instance) => instance.url === "/api/session/session-1/events",
    );
    await waitFor(() => typeof sessionEventSource?.onmessage === "function");

    await act(async () => {
      await latestSnapshot?.send([{ type: "text", text: "Continue mission" }]);
    });

    await waitFor(
      () =>
        fetchMock.mock.calls.some(([input]) => String(input) === "/api/session/session-1"),
    );
    await waitFor(() => useChatStore.getState().sessionStates["session-1"] === "busy");

    await act(async () => {
      sessionEventSource?.onmessage?.call(
        sessionEventSource as unknown as EventSource,
        new MessageEvent("message", {
          data: JSON.stringify({
            properties: {
              sessionID: "session-1",
              status: {
                type: "busy",
              },
            },
            type: "session.status",
          }),
        }),
      );
    });

    await act(async () => {
      sessionEventSource?.onmessage?.call(
        sessionEventSource as unknown as EventSource,
        new MessageEvent("message", {
          data: JSON.stringify({
            properties: {
              part: {
                messageID: "message-2",
                sessionID: "session-1",
                text: "Mission one is responding",
                type: "text",
              },
            },
            type: "message.part.updated",
          }),
        }),
      );
    });

    await waitFor(
      () =>
        latestSnapshot?.liveDraft?.messageId === "message-2" &&
        latestSnapshot.streamingContent === "Mission one is responding",
    );

    deferredSession.resolve(
      createJsonResponse({
        messages: [
          createAssistantMessage("message-1", "Mission one reply"),
          createAssistantMessage("message-2", "Mission one is responding"),
        ],
      }),
    );

    await waitFor(
      () =>
        latestSnapshot?.historyPhase === "ready" &&
        latestSnapshot.liveDraft === null &&
        latestSnapshot.streamingContent === "",
    );

    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      liveDraft: null,
      messages: ["Mission one reply", "Mission one is responding"],
      streamingContent: "",
    });
  });

  it("resubscribes to the pending primary session after route transition into a newly started mission", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    let sessionMessages: MessageInfo[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/mission/start") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { objective?: string };
        expect(body.objective).toBe("Start mission");
        return createJsonResponse({
          missionId: "mission-1",
          noctisSessionId: "session-1",
          operationState: null,
        });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse({
          ...createRuntimePayload(mission),
          sessionStatuses: { "session-1": "busy" },
        });
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
          activeMissionId: null,
          initialMissionData: null,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
          selectedExecutionProjectId: "core-repo",
        }),
      );
    });

    let missionIdPromise: Promise<string | null> | null = null;
    await act(async () => {
      missionIdPromise = latestSnapshot?.send([{ type: "text", text: "Start mission" }]) ?? null;
      await Promise.resolve();
    });

    await waitFor(
      () =>
        fetchMock.mock.calls.some(([input]) => String(input) === "/api/noctis/mission/start"),
    );

    await waitFor(
      () =>
        MockEventSource.instances.some(
          (instance) => instance.url === "/api/session/session-1/events" && !instance.closed,
        ),
    );

    const firstSessionEventSource = MockEventSource.instances.find(
      (instance) => instance.url === "/api/session/session-1/events" && !instance.closed,
    );
    await waitFor(() => typeof firstSessionEventSource?.onmessage === "function");

    await act(async () => {
      firstSessionEventSource?.onmessage?.call(
        firstSessionEventSource as unknown as EventSource,
        new MessageEvent("message", {
          data: JSON.stringify({
            properties: {
              status: {
                type: "busy",
              },
            },
            type: "session.status",
          }),
        }),
      );
    });

    const missionId = await missionIdPromise;
    expect(missionId).toBe("mission-1");
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input) === "/api/session/session-1"),
    ).toHaveLength(0);

    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMissionData: null,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });
    await waitFor(() => firstSessionEventSource?.closed === true);
    await waitFor(
      () =>
        MockEventSource.instances.filter(
          (instance) => instance.url === "/api/session/session-1/events" && !instance.closed,
        ).length === 1,
    );

    const sessionEventSource = MockEventSource.instances.find(
      (instance) =>
        instance.url === "/api/session/session-1/events" &&
        !instance.closed &&
        instance !== firstSessionEventSource,
    );
    await waitFor(() => typeof sessionEventSource?.onmessage === "function");

    await act(async () => {
      sessionEventSource?.onmessage?.call(
        sessionEventSource as unknown as EventSource,
        new MessageEvent("message", {
          data: JSON.stringify({
            properties: {
              part: {
                messageID: "message-1",
                sessionID: "session-1",
                text: "Mission one is responding",
                type: "text",
              },
            },
            type: "message.part.updated",
          }),
        }),
      );
    });
    await waitFor(() => latestSnapshot?.streamingContent === "Mission one is responding");

    sessionMessages = [createAssistantMessage("message-1", "Mission one reply")];
    await act(async () => {
      sessionEventSource?.onmessage?.call(
        sessionEventSource as unknown as EventSource,
        new MessageEvent("message", {
          data: JSON.stringify({
            properties: {
              sessionID: "session-1",
            },
            type: "session.idle",
          }),
        }),
      );
    });
    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      messages: ["Mission one reply"],
      streamingContent: "",
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

  it("does not rehydrate the same primary session again when streaming starts", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    let sessionLoadCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      if (url === "/api/session/session-1") {
        sessionLoadCount += 1;
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
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await waitFor(() => latestSnapshot?.historyPhase === "ready");
    expect(sessionLoadCount).toBe(1);

    await waitFor(
      () =>
        MockEventSource.instances.some(
          (instance) => instance.url === "/api/session/session-1/events",
        ),
    );

    const sessionEventSource = MockEventSource.instances.find(
      (instance) => instance.url === "/api/session/session-1/events",
    );
    await waitFor(() => typeof sessionEventSource?.onmessage === "function");

    await act(async () => {
      sessionEventSource?.onmessage?.call(
        sessionEventSource as unknown as EventSource,
        new MessageEvent("message", {
          data: JSON.stringify({
            properties: {
              part: {
                messageID: "message-2",
                sessionID: "session-1",
                text: "Mission one is responding",
                type: "text",
              },
            },
            type: "message.part.updated",
          }),
        }),
      );
    });

    await flushEffects();
    await flushEffects();
    await flushEffects();

    expect(sessionLoadCount).toBe(1);
  });

  it("does not rehydrate the same primary session again on same-mission rerenders after history is loaded", async () => {
    const initialMission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    let sessionLoadCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(initialMission));
      }

      if (url === "/api/session/session-1") {
        sessionLoadCount += 1;
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
          initialMissionData: initialMission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await waitFor(() => latestSnapshot?.historyPhase === "ready");
    expect(sessionLoadCount).toBe(1);

    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMissionData: { ...initialMission },
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await flushEffects();
    await flushEffects();

    expect(sessionLoadCount).toBe(1);
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
    await waitFor(() => MockEventSource.instances.length > 0);

    const sessionEventSource = MockEventSource.instances.at(-1);
    const handleSessionMessage = sessionEventSource?.onmessage;
    await act(async () => {
      handleSessionMessage?.call(
        sessionEventSource as unknown as EventSource,
        {
          data: JSON.stringify({
            properties: {
              part: {
                messageID: "message-error-1",
                sessionID: "session-1",
                text: "Mission one is responding",
                type: "text",
              },
            },
            type: "message.part.updated",
          }),
        } as MessageEvent<string>,
      );
    });
    await waitFor(() => latestSnapshot?.streamingContent === "Mission one is responding");

    await act(async () => {
      await latestSnapshot?.abort();
    });

    expect(latestSnapshot).toMatchObject({
      historyPhase: "ready",
      isLoadingHistory: false,
      abortSettlementPhase: "settling",
      messages: ["Response interrupted: Aborted"],
      streamingContent: "",
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

  it("surfaces tmux activation-block errors from mission continue responses", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      if (url === "/api/session/session-1") {
        return createJsonResponse({ messages: [] });
      }

      if (url === "/api/noctis/mission/continue") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { missionId?: string };
        expect(body.missionId).toBe("mission-1");
        return createJsonResponse(
          { error: "Tmux write focus is still held by mission mission-2." },
          { ok: false, status: 409 },
        );
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

    await flushEffects();

    await act(async () => {
      await latestSnapshot?.send([{ type: "text", text: "Retry request" }]);
    });

    await flushEffects();

    expect(requireSnapshot(latestSnapshot, "Expected post-send snapshot.").messages).toContain(
      "Something went wrong. Tmux write focus is still held by mission mission-2.",
    );

    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/noctis/mission/continue")).toBe(
      true,
    );
  });

  it("retains only the most recent mission transcript window after optimistic user and error appends exceed the cap", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    const preloadedMessages = createAssistantMessages(159);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        return createJsonResponse(createRuntimePayload(mission));
      }

      if (url === "/api/noctis/mission/continue") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { missionId?: string };
        expect(body.missionId).toBe("mission-1");
        return createJsonResponse({ error: "Continue failed." }, { ok: false, status: 500 });
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
          initialMessageInfos: preloadedMessages,
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    await act(async () => {
      await latestSnapshot?.send([{ type: "text", text: "Retry request" }]);
    });

    await flushEffects();
    const postSendSnapshot = requireSnapshot(latestSnapshot, "Expected post-send retention snapshot.");

    expect(postSendSnapshot.messages).toHaveLength(120);
    expect(postSendSnapshot.messages[0]).toBe("Reply 42");
    expect(postSendSnapshot.messages).toContain("Retry request");
    expect(postSendSnapshot.messages.at(-1)).toBe("Something went wrong. Continue failed.");
    expect(postSendSnapshot.retainedHistory).toEqual({
      isActive: true,
      trimmedConversationUnitCount: 41,
      trimmedMessageCount: 41,
    });
  });

  it("backs off idle runtime polling after the primary stream is healthy", async () => {
    vi.useFakeTimers();

    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    let runtimeFetchCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        runtimeFetchCount += 1;
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
    await waitFor(
      () => MockEventSource.instances.some((instance) => instance.url === "/api/session/session-1/events"),
    );

    const sessionEventSource = MockEventSource.instances.find(
      (instance) => instance.url === "/api/session/session-1/events",
    );
    await waitFor(() => typeof sessionEventSource?.onopen === "function");

    await act(async () => {
      sessionEventSource?.onopen?.call(
        sessionEventSource as unknown as EventSource,
        new Event("open"),
      );
    });

    const baselineFetchCount = runtimeFetchCount;

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(runtimeFetchCount).toBe(baselineFetchCount);

    await act(async () => {
      vi.advanceTimersByTime(15000);
      await Promise.resolve();
    });
    await waitFor(() => runtimeFetchCount > baselineFetchCount);
  });

  it("does not emit session-settled banter while runtime status remains busy", async () => {
    vi.useFakeTimers();

    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    let runtimeFetchCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        runtimeFetchCount += 1;
        return createJsonResponse({
          ...createRuntimePayload(mission),
          sessionStatuses: { "session-1": "busy" },
        });
      }

      if (url === "/api/noctis/missions/mission-1/banter") {
        return createJsonResponse({
          recorded: true,
          entry: {
            id: "banter-1",
            missionId: "mission-1",
            kind: "ambient",
            speakerAgent: "noctis",
            cue: "session-settled",
            renderedMessage: "Settled while still busy",
            createdAt: "2026-04-26T00:00:00.000Z",
          },
        });
      }

      throw new Error(`Unhandled fetch: ${url} ${String(init?.method ?? "GET")}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      useChatStore.getState().setOptimisticSessionState("session-1", "busy", 60_000);
    });

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
      useChatStore.getState().clearOptimisticSessionState("session-1");
    });

    const baselineFetchCount = runtimeFetchCount;
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    await waitFor(() => runtimeFetchCount > baselineFetchCount);

    expect(
      fetchMock.mock.calls.some(([input]) => String(input) === "/api/noctis/missions/mission-1/banter"),
    ).toBe(false);
  });

  it("suppresses repeated session-settled banter within the cooldown window", async () => {
    vi.useFakeTimers();

    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    let runtimeFetchCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        runtimeFetchCount += 1;
        return createJsonResponse({
          ...createRuntimePayload(mission),
          sessionStatuses: {},
        });
      }

      if (url === "/api/noctis/missions/mission-1/banter") {
        return createJsonResponse({
          recorded: true,
          entry: {
            id: `banter-${fetchMock.mock.calls.length}`,
            missionId: "mission-1",
            kind: "ambient",
            speakerAgent: "noctis",
            cue: "session-settled",
            renderedMessage: "Settled",
            createdAt: "2026-04-26T00:00:00.000Z",
          },
        });
      }

      throw new Error(`Unhandled fetch: ${url} ${String(init?.method ?? "GET")}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      useChatStore.getState().setOptimisticSessionState("session-1", "busy", 60_000);
    });

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
      useChatStore.getState().clearOptimisticSessionState("session-1");
    });
    let baselineFetchCount = runtimeFetchCount;
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    await waitFor(() => runtimeFetchCount > baselineFetchCount);

    await act(async () => {
      useChatStore.getState().setOptimisticSessionState("session-1", "busy", 60_000);
    });
    baselineFetchCount = runtimeFetchCount;
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    await waitFor(() => runtimeFetchCount > baselineFetchCount);

    await act(async () => {
      useChatStore.getState().clearOptimisticSessionState("session-1");
    });
    baselineFetchCount = runtimeFetchCount;
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    await waitFor(() => runtimeFetchCount > baselineFetchCount);

    expect(
      fetchMock.mock.calls.filter(([input]) => String(input) === "/api/noctis/missions/mission-1/banter"),
    ).toHaveLength(1);
  });

  it("emits session-settled banter for the Lunafreya surface via the Lunafreya mission endpoint", async () => {
    vi.useFakeTimers();

    const mission = createMission({
      missionId: "mission-1",
      primaryAgentId: "lunafreya",
      primarySessionId: "session-luna",
      surfaceId: "lunafreya",
      sessions: {
        primary: "session-luna",
        noctis: null,
        ignis: null,
        gladiolus: null,
        prompto: null,
      },
    });
    let runtimeFetchCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/lunafreya/missions/mission-1/runtime") {
        runtimeFetchCount += 1;
        return createJsonResponse({
          ...createRuntimePayload(mission),
          sessionStatuses: {},
        });
      }

      if (url === "/api/lunafreya/missions/mission-1/banter") {
        return createJsonResponse({
          recorded: true,
          entry: {
            id: "banter-luna-1",
            missionId: "mission-1",
            kind: "ambient",
            speakerAgent: "lunafreya",
            cue: "session-settled",
            renderedMessage: "The path is quiet now. I will remain ready for what follows.",
            createdAt: "2026-04-26T00:00:00.000Z",
          },
        });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      useChatStore.getState().setOptimisticSessionState("session-luna", "busy", 60_000);
    });

    let latestSnapshot: HookProbeSnapshot | null = null;

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeMissionId: "mission-1",
          initialMessageInfos: [createAssistantMessage("message-1", "Oracle reply")],
          initialMissionData: mission,
          onSnapshot: (snapshot: HookProbeSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });
    await waitFor(() => latestSnapshot?.historyPhase === "ready");

    await act(async () => {
      useChatStore.getState().clearOptimisticSessionState("session-luna");
    });

    const baselineFetchCount = runtimeFetchCount;
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    await waitFor(() => runtimeFetchCount > baselineFetchCount);

    expect(
      fetchMock.mock.calls.some(([input]) => String(input) === "/api/lunafreya/missions/mission-1/banter"),
    ).toBe(true);
  });

  it("triggers a targeted runtime refresh when the primary stream disconnects", async () => {
    const mission = createMission({ missionId: "mission-1", primarySessionId: "session-1" });
    let runtimeFetchCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("/api/noctis/operations")) {
        return createJsonResponse({ operations: [] });
      }

      if (url === "/api/noctis/missions/mission-1/runtime") {
        runtimeFetchCount += 1;
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
    await waitFor(
      () => MockEventSource.instances.some((instance) => instance.url === "/api/session/session-1/events"),
    );

    const sessionEventSource = MockEventSource.instances.find(
      (instance) => instance.url === "/api/session/session-1/events",
    );
    await waitFor(() => typeof sessionEventSource?.onerror === "function");

    const baselineFetchCount = runtimeFetchCount;

    await act(async () => {
      sessionEventSource?.onerror?.call(
        sessionEventSource as unknown as EventSource,
        new Event("error"),
      );
      await Promise.resolve();
    });

    await waitFor(() => runtimeFetchCount > baselineFetchCount);
  });
});