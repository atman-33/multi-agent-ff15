import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildSessionChatRenderSnapshot } from "@/lib/session-chat-rendering-orchestration";
import { toSessionPresentationMessages } from "@/lib/session-message-presentation";

vi.mock("./session-message-bubble", () => ({
  SessionMessageBubble: ({
    message,
    showCursor,
  }: {
    message: {
      id: string;
      senderLabel: string;
      detailRawText: string;
      parts: Array<{ type: string }>;
      messageDisplay: { displayContent: string };
    };
    showCursor?: boolean;
  }) => (
    <article data-message-id={message.id} data-show-cursor={showCursor ? "true" : "false"}>
      <h2>{message.senderLabel}</h2>
      <p>{message.messageDisplay.displayContent}</p>
      <span>{message.parts.filter((part) => part.type === "tool").length}</span>
      <pre>{message.detailRawText}</pre>
    </article>
  ),
}));

import { SessionMessageList } from "./session-message-list";

describe("session-message-list", () => {
  it("renders grouped conversation units and an in-progress streaming unit through the shared bubble component", () => {
    const snapshot = buildSessionChatRenderSnapshot({
      messages: toSessionPresentationMessages([
        {
          info: {
            id: "tool-1",
            role: "assistant",
            agent: "noctis",
            time: { created: Date.parse("2026-04-04T10:00:00.000Z") },
          },
          parts: [{ type: "tool", tool: "bash", state: { status: "completed" } }],
        },
        {
          info: {
            id: "reply-1",
            role: "assistant",
            agent: "noctis",
            time: { created: Date.parse("2026-04-04T10:00:05.000Z") },
          },
          parts: [{ type: "text", text: "了解。今、みんなに聞いている。" }],
        },
      ]),
      streamingText: {
        content: "進行中の返信",
        fallbackSender: "iris",
        fallbackSenderLabel: "Iris",
      },
    });

    const markup = renderToStaticMarkup(
      <SessionMessageList
        getExpandedDetailEntries={() => ({})}
        isConversationUnitExpanded={() => false}
        onToggleConversationUnit={() => undefined}
        onToggleDetailEntry={() => undefined}
        renderedMessages={snapshot.renderedMessages}
        streamingMessage={snapshot.streamingMessage}
      />,
    );

    expect(markup.match(/data-message-id=/g)?.length ?? 0).toBe(2);
    expect(markup).toContain("了解。今、みんなに聞いている。");
    expect(markup).toContain(">1</span>");
    expect(markup).toContain("進行中の返信");
    expect(markup).toContain('data-show-cursor="true"');
  });
});