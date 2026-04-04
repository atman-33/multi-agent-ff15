import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/chat/message-detail-sheet-base", () => ({
  MessageDetailSheetBase: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h1>{title}</h1>
      <div>{children}</div>
    </section>
  ),
}));

import MessageDetailSheet from "./message-detail-sheet";

describe("message-detail-sheet", () => {
  it("uses workflow sender metadata for the visible sender label", () => {
    const markup = renderToStaticMarkup(
      <MessageDetailSheet
        content="Implemented the requested change."
        onOpenChange={() => undefined}
        open={true}
        rawTextContent={`
<operation-prompt>
<worker-report from="ignis" to="noctis">
Implemented the requested change.
</worker-report>
</operation-prompt>
        `.trim()}
        sender="user"
        workflowPresentation={{
          visibleBody: "Implemented the requested change.",
          visibleBodyFrom: "ignis",
          visibleBodyTo: "noctis",
          reportDetails: null,
          workflowPromptSections: [],
          rawPrompt: "<operation-prompt />",
          usedFallback: false,
        }}
      />,
    );

    expect(markup).toContain("Ignis message detail");
    expect(markup).not.toContain("User message detail");
  });
});