import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import MessageList from "./message-list";

vi.mock("./message-bubble", () => ({
  default: ({
    message,
  }: {
    message: {
      id: string;
      senderLabel: string;
      detailRawText: string;
      parts: Array<{ type: string }>;
      messageDisplay: { displayContent: string };
    };
  }) => (
    <article data-message-id={message.id}>
      <h2>{message.senderLabel}</h2>
      <p>{message.messageDisplay.displayContent}</p>
      <span>{message.parts.filter((part) => part.type === "tool").length}</span>
      <pre>{message.detailRawText}</pre>
    </article>
  ),
}));

describe("message-list", () => {
  it("renders grouped Noctis replies as one displayed message with merged intermediate details", () => {
    const markup = renderToStaticMarkup(
      <MessageList
        messages={[
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
        ]}
        streamingContent=""
        viewportRef={{ current: null }}
      />,
    );

    expect(markup.match(/data-message-id=/g)?.length ?? 0).toBe(1);
    expect(markup).toContain("了解。今、みんなに聞いている。");
    expect(markup).toContain(">1</span>");
    expect(markup).toContain("Noctis");
  });
});