import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RenderedSessionMessage } from "@/lib/session-message-presentation";

vi.mock("@/components/chat/message-bubble-base", () => ({
  MessageBubbleBase: ({
    body,
    senderLabel,
    senderMetaSupplement,
  }: {
    body: React.ReactNode;
    senderLabel: string;
    senderMetaSupplement?: React.ReactNode;
  }) => (
    <section>
      <div>{senderLabel}</div>
      <div>{senderMetaSupplement}</div>
      <div>{body}</div>
    </section>
  ),
}));

vi.mock("@/components/chat/message-markdown", () => ({
  MessageMarkdown: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/chat/message-intermediate-details", () => ({
  buildIntermediateDetailSummary: () => "",
  MessageIntermediateDetails: () => null,
  MessageIntermediateDetailsToggle: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("./message-detail-sheet", () => ({
  default: () => null,
}));

import MessageBubble from "./message-bubble";

function createMessage(selectionAdjustment?: RenderedSessionMessage["messageDisplay"]["selectionAdjustment"]): RenderedSessionMessage {
  const bodyText = selectionAdjustment ? "Adjusted reply." : "Normal reply.";

  return {
    id: "assistant-1",
    conversationUnitId: "assistant-1",
    role: "assistant",
    sender: null,
    senderLabel: "Hephaestus (Deep Agent)",
    kind: "assistant_message",
    content: bodyText,
    detailContent: bodyText,
    rawText: bodyText,
    parts: [{ type: "text", text: bodyText }],
    timestamp: new Date("2026-04-07T10:30:00.000Z"),
    source: "session",
    sourceMessageIds: ["assistant-1"],
    detailRawText: bodyText,
    messageDisplay: {
      displayContent: bodyText,
      promptContextSections: [],
      promptContextSource: null,
      rawWorkflowPrompt: null,
      rawPromptPayload: null,
      reportDetails: null,
      selectionAdjustment: selectionAdjustment ?? null,
      resolvedSender: null,
      resolvedSenderIsUser: false,
      resolvedSenderLabel: "Hephaestus (Deep Agent)",
      workflowPresentation: null,
    },
  };
}

describe("message-bubble", () => {
  it("renders a subtle adjustment badge for tracked assistant replies", () => {
    const markup = renderToStaticMarkup(
      <MessageBubble
        message={
          createMessage({
            explanation: "Runtime adjusted the requested selection before recording this reply.",
            requestMessageId: "user-1",
            requested: {
              agent: "Sisyphus (Ultraworker)",
              model: null,
            },
            actual: {
              agent: "Hephaestus (Deep Agent)",
              model: null,
            },
          })
        }
      />,
    );

    expect(markup).toContain("Adjusted");
  });

  it("keeps untracked assistant replies on the existing sender-only path", () => {
    const markup = renderToStaticMarkup(<MessageBubble message={createMessage()} />);

    expect(markup).not.toContain("Adjusted");
  });
});