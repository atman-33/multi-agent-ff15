import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageBubbleBase } from "./message-bubble-base";

describe("message-bubble-base", () => {
  it("renders hover actions with pointer cursors", () => {
    const markup = renderToStaticMarkup(
      <MessageBubbleBase
        align="start"
        body={<p>Main reply.</p>}
        bubbleClassName="border-border/40 bg-white/6 text-foreground"
        copyContent="Main reply."
        renderDetailSheet={() => null}
        senderLabel="Noctis"
        timestamp={new Date("2026-04-07T10:30:00.000Z")}
      />,
    );

    expect(markup.match(/cursor-pointer/g)?.length ?? 0).toBe(2);
  });
});