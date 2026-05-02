// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageInfo } from "./types";

type TestExecutionContext = {
  contextProjectIds: string[];
  executionProjectId: string;
  updatedAt: string | null;
};

type TestLiveDraft = {
  messageId: string;
  parts: Array<{ text: string; type: string }> | undefined;
  sessionId: string;
};

const {
  fetchSessionStatusMock,
  messageComposerState,
  routeContext,
  sessionChatRenderSnapshotMock,
  setServerSessionStateMock,
  useSessionLiveThreadMock,
  useSessionLiveThreadState,
} = vi.hoisted(() => ({
  fetchSessionStatusMock: vi.fn(async () => "idle"),
  messageComposerState: {
    lastProps: null as null | Record<string, unknown>,
  },
  routeContext: {
    outlet: {
      sessions: [
        {
          executionContext: {
            contextProjectIds: [],
            executionProjectId: "root",
            updatedAt: null,
          },
          id: "session-1",
          managedSession: {
            missionId: "mission-1",
            missionTitle: "Oracle Mission",
            ownerAgent: "lunafreya",
            ownerLabel: "Lunafreya",
          },
          title: "Managed Session",
        },
      ],
    },
    params: {
      id: "session-1",
    },
    sessionStates: {
      "session-1": "idle",
    } as Record<string, string>,
  },
  sessionChatRenderSnapshotMock: vi.fn(() => ({
    autoFollowKey: null,
    inspectabilityBoundaries: [],
    renderedMessages: [],
    scrollSignal: "none",
    streamingMessage: null,
  })),
  setServerSessionStateMock: vi.fn(),
  useSessionLiveThreadMock: vi.fn((options) => {
    useSessionLiveThreadState.lastOptions = options;
    return useSessionLiveThreadState.returnValue;
  }),
  useSessionLiveThreadState: {
    lastOptions: null as null | Record<string, unknown>,
    returnValue: {
      clearStreaming: vi.fn(),
      isLiveUnavailable: false,
      liveDraft: null as TestLiveDraft | null,
      resetLiveThread: vi.fn(),
      streamingContent: "",
      streamingMessageId: null as string | null,
    },
  },
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useOutletContext: () => routeContext.outlet,
    useParams: () => routeContext.params,
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/components/chat/thread-frame", () => ({
  ChatThreadFrame: ({ children, footer, header }: { children?: () => React.ReactNode; footer?: React.ReactNode; header?: React.ReactNode }) => (
    <div>
      <div>{header}</div>
      <div>{children?.()}</div>
      <div>{footer}</div>
    </div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("@/hooks/use-conversation-unit-inspectability", () => ({
  useConversationUnitInspectability: () => ({
    getExpandedDetailEntries: () => ({}),
    isConversationUnitExpanded: () => false,
    toggleConversationUnit: () => undefined,
    toggleDetailEntry: () => undefined,
  }),
}));

vi.mock("@/hooks/use-project-registry", () => ({
  useProjectRegistry: () => ({
    data: {
      projects: [],
    },
  }),
}));

vi.mock("@/hooks/use-session-chat-render-snapshot", () => ({
  useSessionChatRenderSnapshot: sessionChatRenderSnapshotMock,
}));

vi.mock("@/hooks/use-session-live-thread", () => ({
  useSessionLiveThread: useSessionLiveThreadMock,
}));

vi.mock("@/stores/chat-store", () => ({
  useChatStore: (
    selector: (state: {
      selectedAgent: string | null;
      selectedModel: { modelID: string; providerID: string; variant?: string } | null;
      sessionStates: Record<string, string>;
      setServerSessionState: typeof setServerSessionStateMock;
    }) => unknown,
  ) =>
    selector({
      selectedAgent: null,
      selectedModel: null,
      sessionStates: routeContext.sessionStates,
      setServerSessionState: setServerSessionStateMock,
    }),
}));

vi.mock("@/lib/session-status", async () => {
  const actual = await vi.importActual<typeof import("@/lib/session-status")>("@/lib/session-status");
  return {
    ...actual,
    fetchSessionStatus: fetchSessionStatusMock,
  };
});

vi.mock("./components/message-composer", () => ({
  default: (props: { disableSendAction?: boolean; helperText?: ReactNode }) => {
    messageComposerState.lastProps = props as Record<string, unknown>;
    return (
      <div
        data-disable-send-action={props.disableSendAction ? "true" : "false"}
        data-message-composer="true"
      >
        {props.helperText}
      </div>
    );
  },
}));

vi.mock("./components/message-list", () => ({
  default: () => <div data-message-list="true" />,
}));

if (typeof window !== "undefined") {
  Object.assign(window, {
    __vite_plugin_react_preamble_installed__: true,
  });
}

async function loadSessionRoute() {
  return (await import("./route")).SessionRoute as unknown as (props: {
    loaderData: unknown;
  }) => ReactNode;
}

function createAssistantMessage(id: string, text: string): MessageInfo {
  return {
    info: {
      id,
      role: "assistant",
      time: { created: Date.parse("2026-04-25T10:00:00.000Z") },
    },
    parts: [{ text, type: "text" }],
  };
}

function createLoaderData(overrides?: {
  executionContext?: TestExecutionContext;
  messages?: MessageInfo[];
  transportMode?: "app-owned" | "tmux-resident";
}): {
  executionContext: TestExecutionContext;
  messages: MessageInfo[];
  transportMode: "app-owned" | "tmux-resident";
} {
  return {
    executionContext: overrides?.executionContext ?? {
      contextProjectIds: [],
      executionProjectId: "root",
      updatedAt: null,
    },
    messages: overrides?.messages ?? [],
    transportMode: overrides?.transportMode ?? "app-owned",
  };
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(predicate: () => boolean, attempts = 20): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    await flushEffects();
    if (predicate()) {
      return;
    }
  }

  throw new Error("Condition was not met before timeout.");
}

describe("opencode session route", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    routeContext.outlet.sessions = [
      {
        executionContext: {
          contextProjectIds: [],
          executionProjectId: "root",
          updatedAt: null,
        },
        id: "session-1",
        managedSession: {
          missionId: "mission-1",
          missionTitle: "Oracle Mission",
          ownerAgent: "lunafreya",
          ownerLabel: "Lunafreya",
        },
        title: "Managed Session",
      },
    ];
    routeContext.params = { id: "session-1" };
    routeContext.sessionStates = { "session-1": "idle" };
    sessionChatRenderSnapshotMock.mockReset();
    sessionChatRenderSnapshotMock.mockReturnValue({
      autoFollowKey: null,
      inspectabilityBoundaries: [],
      renderedMessages: [],
      scrollSignal: "none",
      streamingMessage: null,
    });
    setServerSessionStateMock.mockReset();
    fetchSessionStatusMock.mockReset();
    fetchSessionStatusMock.mockResolvedValue("idle");
    useSessionLiveThreadState.lastOptions = null;
    useSessionLiveThreadState.returnValue = {
      clearStreaming: vi.fn(),
      isLiveUnavailable: false,
      liveDraft: null,
      resetLiveThread: vi.fn(),
      streamingContent: "",
      streamingMessageId: null,
    };
    messageComposerState.lastProps = null;
    useSessionLiveThreadMock.mockClear();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container.remove();
    vi.unstubAllGlobals();
  });

  it("passes managed-session live drafts into the shared snapshot contract", async () => {
    useSessionLiveThreadState.returnValue = {
      clearStreaming: vi.fn(),
      isLiveUnavailable: false,
      liveDraft: {
        messageId: "assistant-1",
        parts: [{ text: "Thinking through the next step", type: "reasoning" }],
        sessionId: "session-1",
      },
      resetLiveThread: vi.fn(),
      streamingContent: "",
      streamingMessageId: "assistant-1",
    };

    const SessionRoute = await loadSessionRoute();
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(SessionRoute, { loaderData: createLoaderData() }));
    });

    expect(sessionChatRenderSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveDraft: {
          fallbackSender: null,
          fallbackSenderLabel: "Lunafreya",
          messageId: "assistant-1",
          parts: [{ text: "Thinking through the next step", type: "reasoning" }],
        },
      }),
    );
  });

  it("merges authoritative text-part matches back into the route message state", async () => {
    const SessionRoute = await loadSessionRoute();
    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(SessionRoute, {
          loaderData: createLoaderData({
            messages: [createAssistantMessage("assistant-1", "Hel")],
          }),
        }),
      );
    });

    const lastOptions = useSessionLiveThreadState.lastOptions as {
      onTextPartMatched?: (event: { messageId: string; text: string }) => boolean;
    } | null;
    expect(lastOptions?.onTextPartMatched).toBeTypeOf("function");

    let matched = false;
    await act(async () => {
      matched = lastOptions?.onTextPartMatched?.({ messageId: "assistant-1", text: "Hello" }) ?? false;
    });

    expect(matched).toBe(true);
    await waitFor(() => {
      const snapshotCalls = sessionChatRenderSnapshotMock.mock.calls as unknown as Array<[
        { messages?: Array<{ content?: string }> },
      ]>;
      const lastCall = snapshotCalls.at(-1)?.[0] as
        | { messages?: Array<{ content?: string }> }
        | undefined;
      return Array.isArray(lastCall?.messages) && lastCall.messages.at(0)?.content === "Hello";
    });
  });

  it("refreshes status and authoritative history when live events become unavailable during an active session", async () => {
    routeContext.sessionStates = { "session-1": "busy" };
    fetchSessionStatusMock.mockResolvedValue("busy");
    useSessionLiveThreadState.returnValue = {
      clearStreaming: vi.fn(),
      isLiveUnavailable: true,
      liveDraft: null,
      resetLiveThread: vi.fn(),
      streamingContent: "",
      streamingMessageId: null,
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/session/session-1") {
        return {
          json: async () => ({ messages: [] }),
          ok: true,
        } satisfies Pick<Response, "json" | "ok">;
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const SessionRoute = await loadSessionRoute();
    root = createRoot(container);
    await act(async () => {
      root?.render(createElement(SessionRoute, { loaderData: createLoaderData() }));
    });

    await waitFor(() => fetchSessionStatusMock.mock.calls.length >= 1);
    await waitFor(() =>
      fetchMock.mock.calls.some(([input]) => String(input) === "/api/session/session-1"),
    );

    expect(setServerSessionStateMock).toHaveBeenCalledWith("session-1", "busy");
  });

  it("blocks prompt sending in tmux-resident mode and shows guidance", async () => {
    const SessionRoute = await loadSessionRoute();
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(SessionRoute, {
          loaderData: createLoaderData({ transportMode: "tmux-resident" }),
        }),
      );
    });

    expect(container.innerHTML).toContain('data-disable-send-action="true"');
    expect(container.textContent).toContain(
      "Tmux mode is active. Send messages from the tmux pane instead.",
    );
  });
});