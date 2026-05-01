// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultWorkingPartyState } from "@/lib/noctis-working-party";
import { useChatStore } from "@/stores/chat-store";

vi.hoisted(() => {
  const maybeWindow = globalThis as typeof globalThis & {
    window?: typeof globalThis & { __vite_plugin_react_preamble_installed__?: boolean };
    __vite_plugin_react_preamble_installed__?: boolean;
    $RefreshReg$?: (type: unknown, id: string) => void;
    $RefreshSig$?: () => <T>(type: T) => T;
  };

  if (maybeWindow.window) {
    maybeWindow.window.__vite_plugin_react_preamble_installed__ = true;
  }
  maybeWindow.__vite_plugin_react_preamble_installed__ = true;
  maybeWindow.$RefreshReg$ = () => undefined;
  maybeWindow.$RefreshSig$ = () => (type) => type;
});

vi.mock("@/components/chat/message-markdown", () => ({
  MessageMarkdown: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/chat/thread-frame", () => ({
  ChatThreadFrame: ({
    header,
    footer,
    children,
  }: {
    header?: ReactNode;
    footer?: ReactNode;
    children?: (viewportRef: { current: HTMLDivElement | null }) => ReactNode;
  }) => (
    <div>
      <div>{header}</div>
      <div>{footer}</div>
      <div>{children?.({ current: null })}</div>
    </div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverAnchor: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked }: { checked?: boolean }) => (
    <button data-state={checked ? "checked" : "unchecked"} type="button" />
  ),
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/use-conversation-unit-inspectability", () => ({
  useConversationUnitInspectability: () => ({
    getExpandedDetailEntries: () => ({}),
    isConversationUnitExpanded: () => false,
    expandedDetailEntriesByConversationUnit: {},
    toggleConversationUnit: () => undefined,
    toggleDetailEntry: () => undefined,
  }),
}));

vi.mock("@/hooks/use-session-chat-render-snapshot", () => ({
  useSessionChatRenderSnapshot: () => ({
    autoFollowKey: null,
    inspectabilityBoundaries: [],
    scrollSignal: "none",
    renderedMessages: [],
    streamingMessage: null,
  }),
}));

vi.mock("./message-detail-sheet", () => ({
  default: () => null,
}));

import { ChatArea } from "./chat-area";

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  fetch?: typeof fetch;
};

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("chat-area draft persistence", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    useChatStore.setState({
      currentSessionId: null,
      selectedModel: null,
      selectedAgent: null,
      agentModels: {},
      workingParty: createDefaultWorkingPartyState(),
      sessionDrafts: {},
      pendingMissionSessions: {},
      serverSessionStates: {},
      optimisticSessionStates: {},
      sessionStates: {},
      streamingMessageId: null,
      streamingContent: "",
    });
    testGlobal.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/slash-suggestions") {
        return new Response(JSON.stringify({ suggestions: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unhandled fetch: ${url}`);
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }

    container?.remove();
    vi.unstubAllGlobals();
  });

  it("writes the current mission draft to localStorage when typing into a session-backed composer", async () => {
    await act(async () => {
      root?.render(
        <ChatArea
          sessionId="session-1"
          messages={[]}
          isResponding={false}
          contextProjects={[]}
          availableOperations={[]}
          selectedOperation={null}
          activeOperationState={null}
          isOperationSelectionLocked={false}
          onSelectedOperationChange={() => undefined}
          onSend={() => undefined}
        />, 
      );
    });
    await flushEffects();

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;

      valueSetter?.call(textarea, "Keep this mission note");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flushEffects();

    expect(window.localStorage.getItem("ff15.sessionDrafts")).toContain("session-1");
    expect(window.localStorage.getItem("ff15.sessionDrafts")).toContain("Keep this mission note");
  });

  it("writes a surface-scoped new mission draft when no session is attached yet", async () => {
    await act(async () => {
      root?.render(
        <ChatArea
          composerDraftKey="mission-surface:lunafreya:new"
          sessionId={null}
          messages={[]}
          isResponding={false}
          contextProjects={[]}
          availableOperations={[]}
          selectedOperation={null}
          activeOperationState={null}
          isOperationSelectionLocked={false}
          onSelectedOperationChange={() => undefined}
          onSend={() => undefined}
        />,
      );
    });
    await flushEffects();

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    await act(async () => {
      if (!textarea) {
        return;
      }

      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;

      valueSetter?.call(textarea, "Preserve Lunafreya draft");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flushEffects();

    expect(window.localStorage.getItem("ff15.sessionDrafts")).toContain(
      "mission-surface:lunafreya:new",
    );
    expect(window.localStorage.getItem("ff15.sessionDrafts")).toContain("Preserve Lunafreya draft");
  });

  it("restores an existing persisted draft on mount", async () => {
    useChatStore.setState({
      sessionDrafts: {
        "mission-surface:noctis_team:new": {
          value: "Reload-safe draft",
          fileMentions: [],
          slashMentions: [],
        },
      },
    });

    await act(async () => {
      root?.render(
        <ChatArea
          composerDraftKey="mission-surface:noctis_team:new"
          sessionId={null}
          messages={[]}
          isResponding={false}
          contextProjects={[]}
          availableOperations={[]}
          selectedOperation={null}
          activeOperationState={null}
          isOperationSelectionLocked={false}
          onSelectedOperationChange={() => undefined}
          onSend={() => undefined}
        />,
      );
    });
    await flushEffects();

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect((textarea as HTMLTextAreaElement).value).toBe("Reload-safe draft");
  });
});