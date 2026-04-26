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

import MessageDetailSheet from "./message-detail-sheet";

describe("message-detail-sheet", () => {
  it("uses workflow sender metadata for the visible sender label", () => {
    const rawPrompt = `
<operation-prompt>
<instruction>
Follow the handoff.
</instruction>

<worker-report from="ignis" to="noctis">
Implemented the requested change.
</worker-report>
</operation-prompt>
        `.trim();
    const markup = renderToStaticMarkup(
      <MessageDetailSheet
        content="Implemented the requested change."
        onOpenChange={() => undefined}
        open={true}
        parts={[
          { type: "text", text: "Implemented the requested change." },
          { type: "reasoning", text: "Double-check the handoff before responding." },
          {
            type: "tool",
            tool: "shell",
            state: {
              status: "completed",
              output: "tool output",
            },
          },
        ]}
        rawTextContent={rawPrompt}
        sender="user"
        workflowPresentation={{
          visibleBody: "Implemented the requested change.",
          visibleBodyFrom: "ignis",
          visibleBodyTo: "noctis",
          reportDetails: null,
          promptContextSections: [
            {
              key: "instruction:0",
              tagName: "instruction",
              label: "Instruction",
              content: "Follow the handoff.",
              preview: "Follow the handoff.",
              source: "workflow",
            },
          ],
          rawPrompt,
          usedFallback: false,
        }}
      />,
    );

    expect(markup).toContain("Ignis message detail");
    expect(markup).toContain('data-copy-content="Implemented the requested change."');
    expect(markup).not.toContain("User message detail");
    expect(markup).toContain("Prompt Context");
    expect(markup).toContain("Operation");
    expect(markup).toContain("Instruction");
    expect(markup).toContain("Raw Message Payload");
    expect(markup).not.toContain("data-copy-content=\"&lt;operation-prompt&gt;");
  });
});