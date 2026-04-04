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

describe("session message-detail-sheet", () => {
  it("renders injected prompt context sections with a neutral heading", () => {
    const rawText = `
<workspace-context>
project_root: /tmp/example
</workspace-context>

<tooling-context>
serena_project: multi-agent-ff15
</tooling-context>

Visible reply from assistant.
    `.trim();

    const markup = renderToStaticMarkup(
      <MessageDetailSheet
        content="Visible reply from assistant."
        onOpenChange={() => undefined}
        open={true}
        parts={[{ type: "text", text: rawText }]}
        rawTextContent={rawText}
        senderLabel="Assistant"
      />,
    );

    expect(markup).toContain("Prompt Context");
    expect(markup).toContain("Injected");
    expect(markup).toContain("Workspace Context");
    expect(markup).toContain("Tooling Context");
    expect(markup).not.toContain("Internal Context");
    expect(markup.indexOf("Workspace Context")).toBeLessThan(markup.indexOf("Tooling Context"));
  });
});
