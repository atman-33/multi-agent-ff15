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
        messageRole="assistant"
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

  it("renders workflow visible body and sender label instead of raw operation prompt", () => {
    const rawText = `
<operation-prompt>
<operation-note>
Integrate the child-task result.
</operation-note>

<instruction>
Respond after reviewing the worker report.
</instruction>

<worker-report from="ignis" to="noctis" next="COMPLETE">
普通、集中
</worker-report>
</operation-prompt>
    `.trim();

    const markup = renderToStaticMarkup(
      <MessageDetailSheet
        content="普通、集中"
        messageRole="assistant"
        onOpenChange={() => undefined}
        open={true}
        parts={[{ type: "text", text: rawText }]}
        rawTextContent={rawText}
        senderLabel="Assistant"
      />,
    );

    expect(markup).toContain("Ignis message detail");
    expect(markup).toContain("Prompt Context");
    expect(markup).toContain("Workflow");
    expect(markup).toContain("Operation Note");
    expect(markup).toContain("Instruction");
    expect(markup).toContain("普通、集中");
  });
});
