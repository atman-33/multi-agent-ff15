import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RenderedSessionMessage } from "@/lib/session-message-presentation";
import { IrisAuthoringSheet } from "./iris-authoring-sheet";

vi.mock("@/components/chat/prompt-composer", () => ({
  PromptComposer: ({ helperText, placeholder }: { helperText?: ReactNode; placeholder?: string }) => (
    <div>
      <div>{placeholder}</div>
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

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
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
  it("renders the Iris portrait and session controls inside the right-side sheet", () => {
    const markup = renderToStaticMarkup(
      <IrisAuthoringSheet
        autoFollowKey={null}
        composerDraftKey="operation-studio:iris:builtin"
        conversationSummary="Noctis Team · Builtin · Default (Autonomous)"
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        renderedMessages={[]}
        scopeLabel="Noctis Team"
        scrollSignal="none"
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
        composerDraftKey="operation-studio:iris:builtin"
        conversationSummary="Noctis Team · Builtin · Default (Autonomous)"
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        renderedMessages={[]}
        scopeLabel="Noctis Team"
        scrollSignal="none"
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
        composerDraftKey="operation-studio:iris:builtin"
        conversationSummary="Noctis Team · Builtin · Default (Autonomous)"
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        renderedMessages={[]}
        scopeLabel="Noctis Team"
        scrollSignal="none"
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
        composerDraftKey="operation-studio:iris:builtin"
        conversationSummary="Noctis Team · Builtin · Default (Autonomous)"
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        renderedMessages={[]}
        scopeLabel="Noctis Team"
        scrollSignal="none"
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

  it("renders existing conversation messages when a Studio-scoped session already exists", () => {
    const markup = renderToStaticMarkup(
      <IrisAuthoringSheet
        autoFollowKey="tail:message-1"
        composerDraftKey="operation-studio:iris:project-alpha"
        conversationSummary="Lunafreya · Project Alpha · lunafreya-autonomous"
        isLoading={false}
        isOpen={true}
        isSending={false}
        onClose={() => undefined}
        onNewSession={() => undefined}
        onSend={() => Promise.resolve()}
        renderedMessages={[createRenderedMessage()]}
        scopeLabel="Lunafreya"
        scrollSignal="tail-append"
        selectedEntryLabel="lunafreya-autonomous"
        sessionId="session-iris-1"
        sessionStatus="idle"
        streamingMessage={null}
        targetLabel="Project · Alpha"
      />,
    );

    expect(markup).toContain("I can help revise this operation.");
    expect(markup).toContain("Ask Iris to revise the selected operation");
    expect(markup).toContain("lunafreya-autonomous");
  });
});