// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sessionChatRenderSnapshotMock } = vi.hoisted(() => ({
  sessionChatRenderSnapshotMock: vi.fn(),
}));

const { messageDetailSheetMock } = vi.hoisted(() => ({
  messageDetailSheetMock: vi.fn(),
}));

vi.hoisted(() => {
  const maybeWindow = globalThis as typeof globalThis & {
    window?: typeof globalThis & { __vite_plugin_react_preamble_installed__?: boolean };
    __vite_plugin_react_preamble_installed__?: boolean;
    $RefreshReg$?: (type: unknown, id: string) => void;
    $RefreshSig$?: () => <T>(type: T) => T;
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };

  if (maybeWindow.window) {
    maybeWindow.window.__vite_plugin_react_preamble_installed__ = true;
  }
  maybeWindow.__vite_plugin_react_preamble_installed__ = true;
  maybeWindow.$RefreshReg$ = () => undefined;
  maybeWindow.$RefreshSig$ = () => (type) => type;
  maybeWindow.IS_REACT_ACT_ENVIRONMENT = true;
});

vi.mock("@/components/chat/message-markdown", () => ({
  MessageMarkdown: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/chat/message-intermediate-details", () => ({
  buildIntermediateDetailSummary: () => "",
  MessageIntermediateDetails: () => null,
  MessageIntermediateDetailsToggle: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/chat/prompt-composer", () => ({
  PromptComposer: () => <div />,
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

vi.mock("@/components/workspace-launch-actions", () => ({
  WorkspaceLaunchActions: () => null,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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
  useSessionChatRenderSnapshot: (input: unknown) => sessionChatRenderSnapshotMock(input),
}));

vi.mock("@/stores/chat-store", () => ({
  useChatStore: (selector: (state: { workingParty: string[] }) => unknown) =>
    selector({ workingParty: [] }),
}));

vi.mock("./message-detail-sheet", () => ({
  default: ({
    detailState,
    onOpenChange,
    open,
  }: {
    detailState?: string;
    onOpenChange: (open: boolean) => void;
    open: boolean;
  }) => {
    messageDetailSheetMock({ detailState, open });

    return (
      <div
        data-detail-state={detailState ?? ""}
        data-message-detail-sheet={open ? "open" : "closed"}
      >
        <button onClick={() => onOpenChange(false)} type="button">
          Close detail
        </button>
      </div>
    );
  },
}));

import { ChatArea } from "./chat-area";

function createRenderedMessage() {
  return {
    id: "assistant-1",
    conversationUnitId: "assistant-1",
    role: "assistant",
    sender: "noctis",
    senderLabel: "Noctis",
    kind: "assistant_message",
    content: "Sliding detail.",
    detailContent: "Sliding detail.",
    rawText: "Sliding detail.",
    parts: [{ type: "text", text: "Sliding detail." }],
    timestamp: new Date("2026-05-08T10:30:00.000Z"),
    source: "session",
    sourceMessageIds: ["assistant-1"],
    detailRawText: "Sliding detail.",
    detailState: undefined,
    messageDisplay: {
      displayContent: "Sliding detail.",
      promptContextSections: [],
      promptContextSource: null,
      rawWorkflowPrompt: null,
      rawPromptPayload: null,
      reportDetails: null,
      selectionAdjustment: null,
      resolvedSender: "noctis",
      resolvedSenderIsUser: false,
      resolvedSenderLabel: "Noctis",
      workflowPresentation: null,
    },
  };
}

describe("chat-area detail sheet presence", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    messageDetailSheetMock.mockReset();
    sessionChatRenderSnapshotMock.mockReset();
    sessionChatRenderSnapshotMock.mockReturnValue({
      autoFollowKey: "message",
      inspectabilityBoundaries: [],
      scrollSignal: "none",
      renderedMessages: [createRenderedMessage()],
      streamingMessage: null,
      showPendingIndicator: false,
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container.remove();
  });

  it("keeps the detail sheet wrapper mounted as closed after the user closes it", async () => {
    await act(async () => {
      root?.render(
        <ChatArea
          messages={[]}
          isResponding={false}
          sessionId="session-1"
          primaryAgentId="noctis"
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

    const openButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Open detail"),
    );

    expect(openButton).not.toBeUndefined();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.innerHTML).toContain('data-message-detail-sheet="open"');

    const closeButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Close detail"),
    );

    expect(closeButton).not.toBeUndefined();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.innerHTML).toContain('data-message-detail-sheet="closed"');
  });

  it("passes summary detail state through to the mission detail sheet", async () => {
    sessionChatRenderSnapshotMock.mockReturnValue({
      autoFollowKey: "message",
      inspectabilityBoundaries: [],
      scrollSignal: "none",
      renderedMessages: [
        {
          ...createRenderedMessage(),
          detailState: "summary",
        },
      ],
      streamingMessage: null,
      showPendingIndicator: false,
    });

    await act(async () => {
      root?.render(
        <ChatArea
          messages={[]}
          isResponding={false}
          sessionId="session-1"
          primaryAgentId="noctis"
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

    expect(container.innerHTML).toContain('data-detail-state="summary"');
    expect(messageDetailSheetMock).toHaveBeenCalledWith(
      expect.objectContaining({ detailState: "summary", open: false }),
    );
  });
});