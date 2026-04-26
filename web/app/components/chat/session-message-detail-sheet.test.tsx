import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/chat/message-detail-sheet-base", () => ({
  MessageDetailSheetBase: ({
    title,
    children,
    copyContent,
  }: {
    title: string;
    children: React.ReactNode;
    copyContent: string;
  }) => (
    <section>
      <h1>{title}</h1>
      <div data-copy-content={copyContent} />
      <div>{children}</div>
    </section>
  ),
}));

import { SessionMessageDetailSheet } from "./session-message-detail-sheet";

describe("session-message-detail-sheet", () => {
  it("renders a shared raw payload block and labeled tool input/output", () => {
    const rawText = `
<operation-prompt>
<instruction>
Work through the operation context carefully.
</instruction>

<user-request from="user" to="iris">
Please inspect this workflow.
</user-request>
</operation-prompt>
    `.trim();

    const markup = renderToStaticMarkup(
      <SessionMessageDetailSheet
        content="Please inspect this workflow."
        fallbackSender="user"
        fallbackSenderLabel="User"
        onOpenChange={() => undefined}
        open={true}
        parts={[
          { type: "text", text: rawText },
          {
            type: "tool",
            tool: "read_file",
            state: {
              input: {
                filePath: "/tmp/example.txt",
              },
              output: "done",
              status: "completed",
            },
          },
        ]}
        rawTextContent={rawText}
      />,
    );

    expect(markup).toContain("User message detail");
    expect(markup).toContain('data-copy-content="Please inspect this workflow."');
    expect(markup).toContain("Raw Message Payload");
    expect(markup).toContain("&lt;operation-prompt&gt;");
    expect(markup).toContain("Tool Activity");
    expect(markup).toContain("Input");
    expect(markup).toContain("/tmp/example.txt");
    expect(markup).toContain("Output");
    expect(markup).toContain("done");
  });
});