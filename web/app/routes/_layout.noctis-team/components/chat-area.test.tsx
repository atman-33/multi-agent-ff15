import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSessionChatRenderSnapshot } from "@/lib/session-chat-rendering-orchestration";

const { sessionChatRenderSnapshotMock } = vi.hoisted(() => ({
  sessionChatRenderSnapshotMock: vi.fn(),
}));

vi.mock("@/components/chat/prompt-composer", () => ({
  PromptComposer: ({
    topSlot,
    disableSendAction,
  }: {
    topSlot?: ReactNode;
    disableSendAction?: boolean;
  }) => (
    <div>
      <div>{disableSendAction ? "send-disabled" : "send-enabled"}</div>
      {topSlot}
    </div>
  ),
}));

vi.mock("@/components/chat/thread-frame", () => ({
  ChatThreadFrame: ({
    header,
    footer,
    children,
  }: {
    header?: ReactNode;
    footer?: ReactNode;
    children?: () => ReactNode;
  }) => (
    <div>
      <div>{header}</div>
      <div>{footer}</div>
      <div>{children?.()}</div>
    </div>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => <div data-select-content="true">{children}</div>,
  SelectItem: ({ children, value }: { children?: ReactNode; value?: string }) => (
    <div data-select-item={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children?: ReactNode }) => <div data-select-trigger="true">{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/chat/message-bubble-base", () => ({
  MessageBubbleBase: ({
    body,
    details,
    copyContent,
  }: {
    body?: ReactNode;
    details?: ReactNode;
    copyContent: string;
  }) => (
    <section data-copy-content={copyContent}>
      {body}
      {details}
    </section>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    disabled,
    "aria-label": ariaLabel,
  }: {
    checked?: boolean;
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <button
      aria-label={ariaLabel}
      data-disabled={disabled ? "yes" : "no"}
      data-state={checked ? "checked" : "unchecked"}
      type="button"
    />
  ),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <div data-tooltip-root="true">{children}</div>,
  TooltipContent: ({ children }: { children?: ReactNode }) => (
    <div data-tooltip-content="true">{children}</div>
  ),
  TooltipTrigger: ({ children }: { children?: ReactNode }) => (
    <div data-tooltip-trigger="true">{children}</div>
  ),
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

import { ChatArea } from "./chat-area";

describe("chat-area", () => {
  beforeEach(() => {
    sessionChatRenderSnapshotMock.mockReset();
    sessionChatRenderSnapshotMock.mockReturnValue({
      autoFollowKey: "empty",
      inspectabilityBoundaries: [],
      scrollSignal: "none",
      renderedMessages: [],
      streamingMessage: null,
    });
  });

  it("shows compact execution project controls without the old setup heading", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        isResponding={false}
        showExecutionProjectSelector={true}
        executionProjectOptions={[
          { value: "core-repo", label: "Core Repo" },
          { value: "docs-repo", label: "Reference Docs" },
        ]}
        selectedExecutionProjectId="core-repo"
        executionProjectHint="Secondary context starts with Projects page presets."
        selectedExecutionTargetMode="execution_project"
        contextProjects={[
          { id: "docs-repo", label: "Reference Docs" },
          { id: "api-repo", label: "API Notes" },
          { id: "ops-repo", label: "Ops Runbook" },
        ]}
        contextActionLabel="Mission Context"
        onContextAction={() => undefined}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={false}
        onSelectedExecutionProjectChange={() => undefined}
        onSelectedExecutionTargetModeChange={() => undefined}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Execution Project");
    expect(markup).toContain("Operation");
    expect(markup).toContain("Context");
    expect(markup).toContain("Reference Docs");
    expect(markup).toContain("API Notes");
    expect(markup).toContain("Ops Runbook");
    expect(markup).toContain("Mission Context");
    expect(markup).toContain("Execution project help");
    expect(markup).toContain("Secondary context starts with Projects page presets.");
    expect(markup).toContain("Dedicated workspace");
    expect(markup).toContain("Execution mode help");
    expect(markup).toContain("Work directly in the registered project folder");
    expect(markup).toContain("Create a mission-specific workspace and work there");
    expect(markup).toContain('data-state="unchecked"');
    expect(markup).not.toContain("+1");
    expect(markup).not.toContain("Mission Setup");
  });

  it("shows mission-start feedback and disables sending while a new mission is starting", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        isResponding={true}
        isStartingMission={true}
        showExecutionProjectSelector={true}
        executionProjectOptions={[
          { value: "core-repo", label: "Core Repo" },
          { value: "docs-repo", label: "Reference Docs" },
        ]}
        selectedExecutionProjectId="core-repo"
        executionProjectHint="Secondary context starts with Projects page presets."
        selectedExecutionTargetMode="execution_project"
        contextProjects={[]}
        contextActionLabel="Mission Context"
        onContextAction={() => undefined}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={false}
        onSelectedExecutionProjectChange={() => undefined}
        onSelectedExecutionTargetModeChange={() => undefined}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Starting Mission");
    expect(markup).toContain("Preparing mission and briefing Noctis.");
    expect(markup).toContain("/images/chocobo.png");
    expect(markup).toContain("send-disabled");
    expect(markup).toContain('data-state="unchecked"');
    expect(markup).toContain('data-disabled="yes"');
  });

  it("shows execution and context summary instead of operation help text after mission start", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        isResponding={false}
        missionExecutionLabel="Core Repo"
        contextProjects={[
          { id: "docs-repo", label: "Reference Docs" },
          { id: "api-repo", label: "API Notes" },
          { id: "ops-repo", label: "Ops Runbook" },
        ]}
        missionActionLabel="Mission Details"
        onMissionAction={() => undefined}
        availableOperations={[
          {
            value: "builtin:noctis-autonomous",
            label: "Autonomous",
            description: "",
            isDefault: true,
            name: "noctis-autonomous",
            sourceKind: "builtin",
            sourceLabel: "Builtin",
          },
        ]}
        selectedOperation="builtin:noctis-autonomous"
        activeOperationState={null}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain(">Execution<");
    expect(markup).toContain(">Core Repo<");
    expect(markup).toContain(">Context<");
    expect(markup).toContain(">Reference Docs<");
    expect(markup).toContain(">API Notes<");
    expect(markup).toContain(">Ops Runbook<");
    expect(markup).toContain(
      'class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-3 py-1.5 text-[11px] shadow-sm"><span class="font-mono text-[10px] uppercase tracking-[0.16em] text-primary/70">Context</span>',
    );
    expect(markup).toContain(">Operation<");
    expect(markup).toContain(">Autonomous<");
    expect(markup).toContain("Mission Details");
    expect(markup).not.toContain("+1");
    expect(markup).not.toContain("Operation: Operation unavailable");
    expect(markup).not.toContain("This mission is already running with its current operation setting.");
    expect(markup).not.toContain("Mission Operation");
    expect(markup).not.toContain("Starting Mission");
    expect(markup).not.toContain("Operation Progress");
  });

  it("shows compact operation progress and revisit details in the header", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        isResponding={false}
        missionExecutionLabel="Core Repo"
        contextProjects={[{ id: "docs-repo", label: "Reference Docs" }]}
        missionActionLabel="Mission Details"
        onMissionAction={() => undefined}
        availableOperations={[]}
        selectedOperation="builtin:ja:test-review-cycle-flow.yaml"
        activeOperationState={null}
        workflowProgress={{
          workflowLabel: "test-review-cycle-flow",
          currentStep: "review",
          currentStepIndex: 3,
          totalSteps: 5,
          status: "waiting_for_report",
          updatedAt: "2026-04-11T00:16:00.000Z",
          visitCount: 2,
          isTerminal: false,
        }}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Operation");
    expect(markup).toContain("3/5");
    expect(markup).toContain("Waiting");
    expect(markup).toContain("review");
    expect(markup).toContain("test-review-cycle-flow");
    expect(markup).toContain("Pass 2");
  });

  it("keeps terminal operation progress visible in the header", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        isResponding={false}
        missionExecutionLabel="Core Repo"
        contextProjects={[]}
        missionActionLabel="Mission Details"
        onMissionAction={() => undefined}
        availableOperations={[]}
        selectedOperation="builtin:ja:test-review-cycle-flow.yaml"
        activeOperationState={null}
        workflowProgress={{
          workflowLabel: "test-review-cycle-flow",
          currentStep: "refactor",
          currentStepIndex: 5,
          totalSteps: 5,
          status: "complete",
          updatedAt: "2026-04-11T00:20:00.000Z",
          visitCount: 1,
          isTerminal: true,
        }}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Operation");
    expect(markup).toContain("5/5");
    expect(markup).toContain("Done");
    expect(markup).toContain("refactor");
  });

  it("removes active-mission header shortcuts", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        isResponding={false}
        isSessionActive={true}
        missionExecutionLabel="Core Repo"
        contextProjects={[]}
        availableOperations={[]}
        selectedOperation="builtin:ja:test-review-cycle-flow.yaml"
        activeOperationState={null}
        workflowProgress={{
          workflowLabel: "test-review-cycle-flow",
          currentStep: "review",
          currentStepIndex: 3,
          totalSteps: 5,
          status: "waiting_for_report",
          updatedAt: "2026-04-11T00:16:00.000Z",
          visitCount: 1,
          isTerminal: false,
        }}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).not.toContain("Radio Incoming");
    expect(markup).not.toContain("Outputs");
  });

  it("shows an explicit loading state while mission history is still hydrating", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        historyPhase="loading"
        isResponding={true}
        isLoadingHistory={true}
        missionExecutionLabel="Core Repo"
        contextProjects={[]}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("transcript-loading-capsule");
    expect(markup).toContain("transcript-loading-dot transcript-loading-dot-1");
    expect(markup).toContain("transcript-loading-dot transcript-loading-dot-3");
    expect(markup).not.toContain("Loading Session History");
    expect(markup).not.toContain("Refreshing the sanitized transcript for this mission.");
    expect(markup).toContain("send-disabled");
  });

  it("suppresses the transcript loading capsule once visible transcript rows already exist", () => {
    sessionChatRenderSnapshotMock.mockReturnValueOnce(
      buildSessionChatRenderSnapshot({
        assistantPending: true,
        messages: [
          {
            content: "Mission one reply",
            detailContent: "Mission one reply",
            id: "assistant-1",
            kind: "assistant_message",
            parts: [{ text: "Mission one reply", type: "text" }],
            rawText: "Mission one reply",
            role: "assistant",
            sender: "noctis",
            senderLabel: "Noctis",
            source: "session",
            timestamp: new Date("2026-04-19T00:00:00.000Z"),
          },
        ],
      }),
    );

    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        historyPhase="loading"
        isResponding={true}
        isLoadingHistory={true}
        isSessionActive={true}
        missionExecutionLabel="Core Repo"
        contextProjects={[]}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Mission one reply");
    expect(markup).not.toContain("transcript-loading-capsule");
    expect(markup).toContain("animate-bounce");
  });

  it("shows an explicit empty state when the mission transcript resolves without messages", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        historyPhase="empty"
        isResponding={false}
        missionExecutionLabel="Core Repo"
        contextProjects={[]}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("No Session History Yet");
    expect(markup).toContain("This mission has not produced a transcript yet.");
    expect(markup).toContain("send-enabled");
  });

  it("shows abort-settlement feedback while resend is blocked", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        historyPhase="ready"
        abortSettlementPhase="settling"
        isResponding={true}
        missionExecutionLabel="Core Repo"
        contextProjects={[]}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Stopping Response");
    expect(markup).toContain("Waiting for the managed session to become idle before sending again.");
    expect(markup).toContain("send-disabled");
  });

  it("shows a stronger warning when abort settlement takes longer than usual", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        historyPhase="ready"
        abortSettlementPhase="delayed"
        isResponding={true}
        missionExecutionLabel="Core Repo"
        contextProjects={[]}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Still Waiting for Session Idle");
    expect(markup).toContain(
      "Stopping is taking longer than usual. Keep editing your next prompt; send will re-enable when the managed session becomes idle.",
    );
    expect(markup).toContain("send-disabled");
  });

  it("shows operation description tooltips only on select options", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        isResponding={false}
        contextProjects={[]}
        availableOperations={[
          {
            value: "builtin:ja:test-review-cycle-flow.yaml",
            label: "test-review-cycle-flow",
            description: "Guided mission flow.",
            isDefault: false,
            name: "test-review-cycle-flow",
            sourceKind: "builtin",
            sourceLabel: "Builtin",
          },
        ]}
        selectedOperation="builtin:ja:test-review-cycle-flow.yaml"
        activeOperationState={null}
        isOperationSelectionLocked={false}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup.match(/data-tooltip-content="true"/g)).toHaveLength(1);
    expect(markup).toContain('data-select-item="builtin:ja:test-review-cycle-flow.yaml"');
    expect(markup).toContain("Guided mission flow.");
  });

  it("shows a transcript error state distinct from an empty transcript", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        historyErrorMessage="Unable to load mission transcript."
        historyPhase="error"
        isResponding={false}
        missionExecutionLabel="Core Repo"
        contextProjects={[]}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Transcript Load Failed");
    expect(markup).toContain("Unable to load mission transcript.");
    expect(markup).not.toContain("No Session History Yet");
  });

  it("renders temporary assistant streaming text through the shared snapshot while keeping the generic typing indicator visible", () => {
    sessionChatRenderSnapshotMock.mockReturnValueOnce(
      buildSessionChatRenderSnapshot({
        assistantPending: true,
        messages: [],
        streamingText: {
          content: "Mission two is responding",
          fallbackSender: "noctis",
          fallbackSenderLabel: "Noctis",
        },
      }),
    );

    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        streamingContent="Mission two is responding"
        isResponding={true}
        isSessionActive={true}
        isStreaming={true}
        contextProjects={[]}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={false}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(sessionChatRenderSnapshotMock).toHaveBeenCalledWith({
      assistantPending: true,
      continuityAssistant: {
        sender: "noctis",
        senderLabel: "Noctis",
      },
      currentStreamingMessageId: null,
      liveDraft: null,
      messages: [],
      streamingText: {
        content: "Mission two is responding",
        fallbackSender: "noctis",
        fallbackSenderLabel: "Noctis",
      },
    });
    expect(markup).toContain("Mission two is responding");
    expect(markup).toContain("animate-bounce");
  });

  it("passes a mission live draft into the shared snapshot contract", () => {
    sessionChatRenderSnapshotMock.mockReturnValueOnce(
      buildSessionChatRenderSnapshot({
        liveDraft: {
          fallbackSender: "lunafreya",
          fallbackSenderLabel: "Lunafreya",
          messageId: "assistant-1",
          parts: [{ text: "Thinking through the next step", type: "reasoning" }],
        },
        messages: [],
      }),
    );

    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        liveDraft={{
          messageId: "assistant-1",
          parts: [{ text: "Thinking through the next step", type: "reasoning" }],
          sessionId: "session-1",
        }}
        isResponding={true}
        isSessionActive={true}
        isStreaming={true}
        contextProjects={[]}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={false}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
        primaryAgentId="lunafreya"
        primaryAgentLabel="Lunafreya"
      />,
    );

    expect(sessionChatRenderSnapshotMock).toHaveBeenCalledWith({
      assistantPending: true,
      continuityAssistant: {
        sender: "lunafreya",
        senderLabel: "Lunafreya",
      },
      currentStreamingMessageId: null,
      liveDraft: {
        fallbackSender: "lunafreya",
        fallbackSenderLabel: "Lunafreya",
        messageId: "assistant-1",
        parts: [{ text: "Thinking through the next step", type: "reasoning" }],
      },
      messages: [],
      streamingText: null,
    });
    expect(markup).toContain("Intermediate activity only.");
    expect(markup).toContain("Commentary");
    expect(markup).toContain("Thinking through the next step");
  });

  it("uses only the visible body for primary-agent copy content", () => {
    sessionChatRenderSnapshotMock.mockReturnValueOnce({
      autoFollowKey: "copy-only-body",
      confirmedInspectabilityBoundaries: [],
      confirmedRenderedMessages: [],
      input: {
        assistantPending: false,
        continuityAssistant: {
          sender: "noctis",
          senderLabel: "Noctis",
        },
        currentStreamingMessageId: null,
        liveDraft: null,
        messages: [],
        streamingText: null,
      },
      inspectabilityBoundaries: [],
      refreshKind: "initial",
      renderedMessages: [
        {
          id: "assistant-1",
          conversationUnitId: "assistant-1",
          role: "assistant",
          sender: "noctis",
          senderLabel: "Noctis",
          kind: "assistant_message",
          content: "Main reply.",
          detailContent: "Main reply.",
          rawText: "Main reply.",
          parts: [
            { type: "text", text: "Main reply." },
            { type: "reasoning", text: "Reasoning that should stay out of copy." },
            {
              type: "tool",
              tool: "shell",
              state: {
                status: "completed",
                output: "tool output",
              },
            },
          ],
          timestamp: new Date("2026-04-07T10:30:00.000Z"),
          source: "session",
          sourceMessageIds: ["assistant-1"],
          detailRawText: "Main reply.",
          messageDisplay: {
            displayContent: "Main reply.",
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
        },
      ],
      scrollSignal: "none",
      showPendingIndicator: false,
      streamingMessage: null,
    });

    const markup = renderToStaticMarkup(
      <ChatArea
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

    expect(markup).toContain('data-copy-content="Main reply."');
    expect(markup).not.toContain('data-copy-content="Main reply.\n\n## Reasoning');
  });

  it("marks the shared snapshot as assistant-pending before visible live content arrives", () => {
    sessionChatRenderSnapshotMock.mockReturnValueOnce(
      buildSessionChatRenderSnapshot({
        assistantPending: true,
        messages: [],
      }),
    );

    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        isResponding={true}
        isSessionActive={true}
        isStreaming={true}
        contextProjects={[]}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={false}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(sessionChatRenderSnapshotMock).toHaveBeenCalledWith({
      assistantPending: true,
      continuityAssistant: {
        sender: "noctis",
        senderLabel: "Noctis",
      },
      currentStreamingMessageId: null,
      liveDraft: null,
      messages: [],
      streamingText: null,
    });
    expect(markup).toContain("animate-bounce");
  });
});