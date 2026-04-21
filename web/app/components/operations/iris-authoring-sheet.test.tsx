import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RenderedSessionMessage } from "@/lib/session-message-presentation";
import { IrisAuthoringSheet, resolveSheetPortalContainer } from "./iris-authoring-sheet";

vi.mock("@/components/compact-model-variant-picker", () => ({
  CompactModelVariantPicker: ({
    ariaLabel,
    selectedModel,
  }: {
    ariaLabel: string;
    selectedModel: { providerID: string; modelID: string; variant?: string } | null;
  }) => (
    <div data-model-picker={ariaLabel}>
      {selectedModel ? `${selectedModel.providerID}/${selectedModel.modelID}` : "none"}
      {selectedModel?.variant ? `:${selectedModel.variant}` : ""}
    </div>
  ),
}));

vi.mock("@/components/chat/prompt-composer", () => ({
  PromptComposer: ({
    disabled,
    footerEnd,
    helperText,
    placeholder,
  }: {
    disabled?: boolean;
    footerEnd?: ReactNode;
    helperText?: ReactNode;
    placeholder?: string;
  }) => (
    <div data-disabled={disabled ? "true" : "false"} data-prompt-composer="true">
      <div>{placeholder}</div>
      <div data-prompt-composer-footer-end="true">{footerEnd}</div>
      <div>{helperText}</div>
    </div>
  ),
}));

vi.mock("@/components/chat/thread-frame", () => ({
  ChatThreadFrame: ({ children, footer, header }: { children: () => ReactNode; footer?: ReactNode; header?: ReactNode }) => (
    <div>
      {header}
      {children()}
      {footer}
    </div>
  ),
}));

vi.mock("@/components/chat/session-message-list", () => ({
  SessionMessageList: ({
    renderedMessages,
    renderAvatar,
    renderDetailSheet,
    streamingMessage,
  }: {
    renderedMessages: RenderedSessionMessage[];
    renderAvatar?: (message: RenderedSessionMessage) => ReactNode;
    renderDetailSheet?: (args: {
      message: RenderedSessionMessage;
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) => ReactNode;
    streamingMessage: RenderedSessionMessage | null;
  }) => (
    <div data-session-message-list="true">
      {renderedMessages.map((message) => (
        <article key={message.conversationUnitId}>
          <div>{message.messageDisplay.displayContent}</div>
          <div>{renderAvatar ? renderAvatar(message) : null}</div>
          <div>{renderDetailSheet ? "detail-sheet" : null}</div>
        </article>
      ))}
      {streamingMessage ? (
        <section data-streaming-message="true">
          {streamingMessage.senderLabel}:{streamingMessage.messageDisplay.displayContent || "cursor"}
        </section>
      ) : <section data-streaming-message="false" />}
    </div>
  ),
}));

vi.mock("@/hooks/use-conversation-unit-inspectability", () => ({
  useConversationUnitInspectability: () => ({
    getExpandedDetailEntries: () => ({}),
    isConversationUnitExpanded: () => false,
    toggleConversationUnit: () => undefined,
    toggleDetailEntry: () => undefined,
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) => <button disabled={disabled} type="button">{children}</button>,
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: ReactNode; open?: boolean }) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function createRenderedMessage(overrides: Partial<RenderedSessionMessage> = {}): RenderedSessionMessage {
  return {
    id: overrides.id ?? "message-1",
    conversationUnitId: overrides.conversationUnitId ?? "message-1",
    role: overrides.role ?? "assistant",
    sender: overrides.sender ?? "iris",
    senderLabel: overrides.senderLabel ?? "Iris",
    kind: overrides.kind ?? "assistant_message",
    content: overrides.content ?? "I can help revise this operation.",
    detailContent: overrides.detailContent ?? "I can help revise this operation.",
    rawText: overrides.rawText ?? "I can help revise this operation.",
    parts: overrides.parts ?? [{ type: "text", text: "I can help revise this operation." }],
    timestamp: overrides.timestamp ?? new Date("2026-04-16T00:00:00.000Z"),
    source: overrides.source ?? "session",
    sourceMessageIds: overrides.sourceMessageIds ?? ["message-1"],
    detailRawText: overrides.detailRawText ?? "I can help revise this operation.",
    messageDisplay: overrides.messageDisplay ?? {
      displayContent: "I can help revise this operation.",
      promptContextSections: [],
      promptContextSource: null,
      rawWorkflowPrompt: null,
      rawPromptPayload: null,
      reportDetails: null,
      selectionAdjustment: null,
      resolvedSender: "iris",
      resolvedSenderIsUser: false,
      resolvedSenderLabel: "Iris",
      workflowPresentation: null,
    },
    selectionAdjustment: overrides.selectionAdjustment ?? null,
    intermediateOnly: overrides.intermediateOnly,
  };
}

describe("iris-authoring-sheet", () => {
  it("returns the attached sheet content element as the popover portal container", () => {
    const currentContainer = { dataset: { current: "true" } } as unknown as HTMLDivElement;
    const nextContainer = { dataset: { next: "true" } } as unknown as HTMLDivElement;

    expect(resolveSheetPortalContainer(null, nextContainer)).toBe(nextContainer);
    expect(resolveSheetPortalContainer(currentContainer, nextContainer)).toBe(nextContainer);
    expect(resolveSheetPortalContainer(nextContainer, nextContainer)).toBe(nextContainer);
    expect(resolveSheetPortalContainer(nextContainer, null)).toBeNull();
  });

  it("renders the Iris portrait and session controls inside the right-side sheet", () => {
    const markup = renderToStaticMarkup(
      <IrisAuthoringSheet
        autoFollowKey={null}
        composerDraftKey="operations:iris:builtin"
        conversationSummary="Noctis Team · Builtin · Default (Autonomous)"
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        onSelectedModelChange={() => undefined}
        renderedMessages={[]}
        scopeLabel="Noctis Team"
        scrollSignal="none"
        selectedModel={null}
        selectedEntryLabel="Default (Autonomous)"
        sessionId={null}
        sessionStatus={null}
        streamingMessage={null}
        targetLabel="Builtin · No project"
      />,
    );

    expect(markup).toContain("Iris");
    expect(markup).toContain("New Session");
    expect(markup).toContain("Noctis Team");
    expect(markup).toContain("/images/iris.png");
  });

  it("reserves space for the sheet close button so the New Session action does not overlap it", () => {
    const markup = renderToStaticMarkup(
      <IrisAuthoringSheet
        autoFollowKey={null}
        composerDraftKey="operations:iris:builtin"
        conversationSummary="Noctis Team · Builtin · Default (Autonomous)"
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        onSelectedModelChange={() => undefined}
        renderedMessages={[]}
        scopeLabel="Noctis Team"
        scrollSignal="none"
        selectedModel={null}
        selectedEntryLabel="Default (Autonomous)"
        sessionId={null}
        sessionStatus={null}
        streamingMessage={null}
        targetLabel="Builtin · No project"
      />,
    );

    expect(markup).toContain("flex flex-wrap items-start justify-between gap-4 pr-12");
    expect(markup).toContain("shrink-0 self-start");
  });

  it("renders circular framed Iris portraits with ambient glow in the header and empty state", () => {
    const markup = renderToStaticMarkup(
      <IrisAuthoringSheet
        autoFollowKey={null}
        composerDraftKey="operations:iris:builtin"
        conversationSummary="Noctis Team · Builtin · Default (Autonomous)"
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        onSelectedModelChange={() => undefined}
        renderedMessages={[]}
        scopeLabel="Noctis Team"
        scrollSignal="none"
        selectedModel={null}
        selectedEntryLabel="Default (Autonomous)"
        sessionId={null}
        sessionStatus={null}
        streamingMessage={null}
        targetLabel="Builtin · No project"
      />,
    );

    expect(markup).toContain("rounded-full border p-1 ring-1 ring-white/6");
    expect(markup).toContain("box-shadow:0 0 18px rgba(56, 189, 248, 0.2)");
    expect(markup).toContain("box-shadow:0 0 26px rgba(56, 189, 248, 0.2)");
  });

  it("applies image-level glow to the circular Iris portraits", () => {
    const markup = renderToStaticMarkup(
      <IrisAuthoringSheet
        autoFollowKey={null}
        composerDraftKey="operations:iris:builtin"
        conversationSummary="Noctis Team · Builtin · Default (Autonomous)"
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        onSelectedModelChange={() => undefined}
        renderedMessages={[]}
        scopeLabel="Noctis Team"
        scrollSignal="none"
        selectedModel={null}
        selectedEntryLabel="Default (Autonomous)"
        sessionId={null}
        sessionStatus={null}
        streamingMessage={null}
        targetLabel="Builtin · No project"
      />,
    );

    expect(markup).toContain("drop-shadow(0 0 3px rgba(125, 211, 252, 0.68))");
    expect(markup).toContain("drop-shadow(0 0 6px rgba(56, 189, 248, 0.3))");
  });

  it("renders the Iris-specific model picker immediately before the send control area", () => {
    const markup = renderToStaticMarkup(
      <IrisAuthoringSheet
        autoFollowKey={null}
        composerDraftKey="operations:iris:builtin"
        conversationSummary="Noctis Team · Builtin · Default (Autonomous)"
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        onSelectedModelChange={() => undefined}
        renderedMessages={[]}
        scopeLabel="Noctis Team"
        scrollSignal="none"
        selectedModel={{ providerID: "openai", modelID: "gpt-5.4", variant: "thinking" }}
        selectedEntryLabel="Default (Autonomous)"
        sessionId={null}
        sessionStatus={null}
        streamingMessage={null}
        targetLabel="Builtin · No project"
      />,
    );

    expect(markup).toContain('data-prompt-composer-footer-end="true"');
    expect(markup).toContain('data-model-picker="Select model for iris"');
    expect(markup).toContain("openai/gpt-5.4:thinking");
    expect(markup).not.toContain("Model changes apply on the next Iris turn.");
  });

  it("does not repeat the studio context in the composer footer", () => {
    const markup = renderToStaticMarkup(
      <IrisAuthoringSheet
        autoFollowKey={null}
        composerDraftKey="operations:iris:builtin"
        conversationSummary="Noctis Team · Builtin · Default (Autonomous)"
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        onSelectedModelChange={() => undefined}
        renderedMessages={[]}
        scopeLabel="Noctis Team"
        scrollSignal="none"
        selectedModel={null}
        selectedEntryLabel="Default (Autonomous)"
        sessionId={null}
        sessionStatus={null}
        streamingMessage={null}
        targetLabel="Builtin · No project"
      />,
    );

    expect(markup).not.toContain("Studio context:");
  });

  it("renders existing conversation messages when a Studio-scoped session already exists", () => {
    const markup = renderToStaticMarkup(
      <IrisAuthoringSheet
        autoFollowKey="tail:message-1"
        composerDraftKey="operations:iris:project-alpha"
        conversationSummary="Lunafreya · Project Alpha · lunafreya-autonomous"
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        onSelectedModelChange={() => undefined}
        renderedMessages={[createRenderedMessage()]}
        scopeLabel="Lunafreya"
        scrollSignal="tail-append"
        selectedModel={null}
        selectedEntryLabel="lunafreya-autonomous"
        sessionId="session-iris-1"
        sessionStatus="idle"
        streamingMessage={null}
        targetLabel="Project · Alpha"
      />,
    );

    expect(markup).toContain('data-session-message-list="true"');
    expect(markup).toContain("I can help revise this operation.");
    expect(markup).toContain("detail-sheet");
    expect(markup).toContain("/images/iris.png");
    expect(markup).toContain("Ask Iris to revise the selected operation");
    expect(markup).toContain("lunafreya-autonomous");
    expect(markup.match(/drop-shadow\(0 0 3px rgba\(125, 211, 252, 0.68\)\)/g)).toHaveLength(2);
    expect(markup).not.toContain("box-shadow:0 0 12px rgba(56, 189, 248, 0.2)");
    expect(markup).not.toContain("h-6 w-6 blur-lg");
  });

  it("shows a route-local Iris dots bubble in the conversation body before streaming text arrives", () => {
    const markup = renderToStaticMarkup(
      <IrisAuthoringSheet
        autoFollowKey="tail:message-1"
        composerDraftKey="operations:iris:project-alpha"
        conversationSummary="Lunafreya · Project Alpha · lunafreya-autonomous"
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        onSelectedModelChange={() => undefined}
        renderedMessages={[createRenderedMessage({
          id: "user-1",
          conversationUnitId: "user-1",
          role: "user",
          sender: "user",
          senderLabel: "User",
          kind: "user_message",
          content: "Please revise this step.",
          detailContent: "Please revise this step.",
          rawText: "Please revise this step.",
          parts: [{ type: "text", text: "Please revise this step." }],
          detailRawText: "Please revise this step.",
          messageDisplay: {
            displayContent: "Please revise this step.",
            promptContextSections: [],
            promptContextSource: null,
            rawWorkflowPrompt: null,
            rawPromptPayload: null,
            reportDetails: null,
            selectionAdjustment: null,
            resolvedSender: "user",
            resolvedSenderIsUser: true,
            resolvedSenderLabel: "User",
            workflowPresentation: null,
          },
        })]}
        scopeLabel="Lunafreya"
        scrollSignal="tail-append"
        selectedModel={null}
        selectedEntryLabel="lunafreya-autonomous"
        sessionId="session-iris-1"
        sessionStatus="busy"
        streamingMessage={null}
        targetLabel="Project · Alpha"
      />,
    );

    expect(markup).toContain('data-streaming-message="false"');
    expect(markup).toContain("animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]");
    expect(markup).toContain("animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]");
  });

  it("supports Projects-specific copy and disables the composer while project-manage is unavailable", () => {
    const markup = renderToStaticMarkup(
      <IrisAuthoringSheet
        autoFollowKey={null}
        composerDraftKey="projects:iris"
        composerHelperText="Pinned project-manage skill is unavailable."
        composerPlaceholder="Ask Iris to register, rename, refresh, or delete a project"
        conversationSummary="Single shared registry conversation"
        description="Project management assistant for the registry."
        emptyDescription="Iris can help register, rename, refresh, or delete projects in the registry."
        emptyTitle="Start a Projects conversation."
        error="Pinned project-manage skill is unavailable."
        isComposerDisabled={true}
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        onSelectedModelChange={() => undefined}
        renderedMessages={[]}
        scopeLabel="Projects"
        scrollSignal="none"
        selectedModel={null}
        selectedEntryLabel="project registry"
        sessionId={null}
        sessionStatus={null}
        streamingMessage={null}
        targetLabel="Project registry operations"
      />,
    );

    expect(markup).toContain("Project management assistant for the registry.");
    expect(markup).toContain("Start a Projects conversation.");
    expect(markup).toContain("Iris can help register, rename, refresh, or delete projects in the registry.");
    expect(markup).toContain("Ask Iris to register, rename, refresh, or delete a project");
    expect(markup).toContain("Pinned project-manage skill is unavailable.");
    expect(markup).toContain('data-disabled="true"');
  });

  it("supports Operations unavailable copy and disables the composer when the pinned skill is unavailable", () => {
    const markup = renderToStaticMarkup(
      <IrisAuthoringSheet
        autoFollowKey={null}
        composerDraftKey="operations:iris:builtin"
        composerHelperText="Pinned operation-customization skill is unavailable."
        conversationSummary="Noctis Team · Builtin · No project · Default (Autonomous)"
        description="Operation authoring assistant for the current selection."
        error={null}
        isComposerDisabled={true}
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        onSelectedModelChange={() => undefined}
        renderedMessages={[]}
        scopeLabel="Noctis Team"
        scrollSignal="none"
        selectedModel={null}
        selectedEntryLabel="Default (Autonomous)"
        sessionId={null}
        sessionStatus={null}
        streamingMessage={null}
        targetLabel="Builtin · No project"
      />,
    );

    expect(markup).toContain("Ask Iris to revise the selected operation");
    expect(markup).toContain("Pinned operation-customization skill is unavailable.");
    expect(markup).toContain('data-disabled="true"');
  });
});