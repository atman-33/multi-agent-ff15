import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildSessionChatRenderSnapshot } from "@/lib/session-chat-rendering-orchestration";
import type { RenderedSessionMessage } from "@/lib/session-message-presentation";

vi.mock("@/components/chat/message-bubble-base", () => ({
  MessageBubbleBase: ({
    avatar,
    body,
    copyContent,
    details,
    renderDetailSheet,
    senderLabel,
    senderMetaSupplement,
  }: {
    avatar?: React.ReactNode;
    body: React.ReactNode;
    copyContent: string;
    details?: React.ReactNode;
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
      <div>{details}</div>
      <div>{`copy:${copyContent}`}</div>
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
  MessageIntermediateDetailsToggle: ({ children }: { children: React.ReactNode }) => (
    <div data-intermediate-toggle="true">{children}</div>
  ),
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

function createUserMessageWithPromptContext(): RenderedSessionMessage {
  return {
    ...createMessage(),
    id: "user-1",
    conversationUnitId: "user-1",
    role: "user",
    sender: "user",
    senderLabel: "User",
    kind: "user_message",
    content: "こんにちは",
    detailContent: "こんにちは",
    rawText: [
      "<operation-prompt>",
      "<job>",
      "# Strategic Advisor",
      "</job>",
      "<user-request from=\"user\" to=\"lunafreya\">",
      "こんにちは",
      "</user-request>",
      "</operation-prompt>",
    ].join("\n"),
    parts: [{ type: "text", text: "こんにちは" }],
    sourceMessageIds: ["user-1"],
    detailRawText: "こんにちは",
    messageDisplay: {
      displayContent: "こんにちは",
      promptContextSections: [
        {
          key: "job:0",
          tagName: "job",
          label: "Job",
          content: "# Strategic Advisor",
          preview: "Strategic Advisor",
          source: "workflow",
        },
      ],
      promptContextSource: "workflow",
      rawWorkflowPrompt: "<operation-prompt>...</operation-prompt>",
      rawPromptPayload: null,
      reportDetails: null,
      selectionAdjustment: null,
      resolvedSender: "user",
      resolvedSenderIsUser: true,
      resolvedSenderLabel: "User",
      workflowPresentation: null,
    },
  };
}

function createAssistantMessageWithPromptContext(): RenderedSessionMessage {
  return {
    ...createMessage(),
    messageDisplay: {
      ...createMessage().messageDisplay,
      displayContent: "了解しました。",
      promptContextSections: [
        {
          key: "instruction:0",
          tagName: "instruction",
          label: "Instruction",
          content: "Respond with calm guidance.",
          preview: "Respond with calm guidance.",
          source: "workflow",
        },
      ],
      promptContextSource: "workflow",
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

  it("uses only the visible message body for copy content", () => {
    const message = createMessage();
    message.parts = [
      { type: "text", text: "Adjusted reply." },
      { type: "reasoning", text: "Thinking through follow-up steps." },
      {
        type: "tool",
        tool: "shell",
        state: {
          status: "completed",
          output: "tool output",
        },
      },
    ];

    const markup = renderToStaticMarkup(
      <SessionMessageBubble message={message} renderDetailSheet={() => null} />,
    );

    expect(markup).toContain("copy:Adjusted reply.");
    expect(markup).not.toContain("Reasoning");
    expect(markup).not.toContain("Tool 1: shell");
    expect(markup).not.toContain("Thinking through follow-up steps.");
    expect(markup).not.toContain("tool output");
  });

  it("does not show intermediate details for user messages that only carry prompt context", () => {
    const markup = renderToStaticMarkup(
      <SessionMessageBubble message={createUserMessageWithPromptContext()} renderDetailSheet={() => null} />,
    );

    expect(markup).not.toContain('data-intermediate-toggle="true"');
    expect(markup).toContain("こんにちは");
  });

  it("keeps intermediate details available for assistant messages with prompt context", () => {
    const markup = renderToStaticMarkup(
      <SessionMessageBubble message={createAssistantMessageWithPromptContext()} renderDetailSheet={() => null} />,
    );

    expect(markup).toContain('data-intermediate-toggle="true"');
    expect(markup).toContain("了解しました。");
  });
});