import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildSessionChatRenderSnapshot } from "@/lib/session-chat-rendering-orchestration";
import type { RenderedSessionMessage } from "@/lib/session-message-presentation";

vi.mock("@/components/chat/message-bubble-base", () => ({
  MessageBubbleBase: ({
    avatar,
    body,
    renderDetailSheet,
    senderLabel,
    senderMetaSupplement,
  }: {
    avatar?: React.ReactNode;
    body: React.ReactNode;
    renderDetailSheet: (args: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) => React.ReactNode;
    senderLabel: string;
    senderMetaSupplement?: React.ReactNode;
  }) => (
    <section>
      <div>{avatar}</div>
      <div>{senderLabel}</div>
      <div>{senderMetaSupplement}</div>
      <div>{body}</div>
      <div>{renderDetailSheet({ open: false, onOpenChange: () => undefined })}</div>
    </section>
  ),
}));

vi.mock("@/components/chat/message-markdown", () => ({
  MessageMarkdown: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/chat/message-intermediate-details", () => ({
  buildIntermediateDetailSummary: () => "",
  MessageIntermediateDetails: () => null,
  MessageIntermediateDetailsToggle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { SessionMessageBubble } from "./session-message-bubble";

function createMessage(): RenderedSessionMessage {
  return {
    id: "assistant-1",
    conversationUnitId: "assistant-1",
    role: "assistant",
    sender: null,
    senderLabel: "Hephaestus (Deep Agent)",
    kind: "assistant_message",
    content: "Adjusted reply.",
    detailContent: "Adjusted reply.",
    rawText: "Adjusted reply.",
    parts: [{ type: "text", text: "Adjusted reply." }],
    timestamp: new Date("2026-04-07T10:30:00.000Z"),
    source: "session",
    sourceMessageIds: ["assistant-1"],
    detailRawText: "Adjusted reply.",
    messageDisplay: {
      displayContent: "Adjusted reply.",
      promptContextSections: [],
      promptContextSource: null,
      rawWorkflowPrompt: null,
      rawPromptPayload: null,
      reportDetails: null,
      selectionAdjustment: {
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
      },
      resolvedSender: null,
      resolvedSenderIsUser: false,
      resolvedSenderLabel: "Hephaestus (Deep Agent)",
      workflowPresentation: null,
    },
  };
}

describe("session-message-bubble", () => {
  it("shows an intermediate activity placeholder for reasoning-only streaming messages", () => {
    const snapshot = buildSessionChatRenderSnapshot({
      liveDraft: {
        fallbackSender: null,
        fallbackSenderLabel: "Assistant",
        messageId: "assistant-1",
        parts: [{ text: "Thinking through the next step", type: "reasoning" }],
      },
      messages: [],
    });

    if (!snapshot.streamingMessage) {
      throw new Error("Expected a streaming message for the live draft test.");
    }

    const markup = renderToStaticMarkup(
      <SessionMessageBubble
        message={snapshot.streamingMessage}
        renderDetailSheet={() => null}
        showCursor={true}
      />,
    );

    expect(markup).toContain("Intermediate activity only.");
  });

  it("renders surface-provided avatar and detail sheet hooks while preserving assistant metadata", () => {
    const markup = renderToStaticMarkup(
      <SessionMessageBubble
        message={createMessage()}
        renderAvatar={(message) => <div>{`avatar:${message.senderLabel}`}</div>}
        renderDetailSheet={({ message }) => <div>{`detail:${message.senderLabel}`}</div>}
      />,
    );

    expect(markup).toContain("avatar:Hephaestus (Deep Agent)");
    expect(markup).toContain("detail:Hephaestus (Deep Agent)");
    expect(markup).toContain("Adjusted");
  });
});