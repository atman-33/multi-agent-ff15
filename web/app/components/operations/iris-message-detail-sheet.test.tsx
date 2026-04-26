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

import { IrisMessageDetailSheet } from "./iris-message-detail-sheet";

describe("iris-message-detail-sheet", () => {
  it("uses only the visible message body for copy content", () => {
    const markup = renderToStaticMarkup(
      <IrisMessageDetailSheet
        message={{
          id: "assistant-1",
          conversationUnitId: "assistant-1",
          role: "assistant",
          sender: null,
          senderLabel: "Iris",
          kind: "assistant_message",
          content: "Main reply.",
          detailContent: "Main reply.",
          rawText: "Main reply.",
          parts: [
            { type: "text", text: "Main reply." },
            { type: "reasoning", text: "Reasoning that should stay out of copy." },
            {
              type: "tool",
              tool: "shell",
              state: {
                status: "completed",
                output: "tool output",
              },
            },
          ],
          timestamp: new Date("2026-04-07T10:30:00.000Z"),
          source: "session",
          sourceMessageIds: ["assistant-1"],
          detailRawText: "Main reply.",
          messageDisplay: {
            displayContent: "Main reply.",
            promptContextSections: [],
            promptContextSource: null,
            rawWorkflowPrompt: null,
            rawPromptPayload: null,
            reportDetails: null,
            selectionAdjustment: null,
            resolvedSender: null,
            resolvedSenderIsUser: false,
            resolvedSenderLabel: "Iris",
            workflowPresentation: null,
          },
        }}
        onOpenChange={() => undefined}
        open={true}
      />,
    );

    expect(markup).toContain('data-copy-content="Main reply."');
    expect(markup).not.toContain('data-copy-content="Main reply.\n\n## Reasoning');
  });
});