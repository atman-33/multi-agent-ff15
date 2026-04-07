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
  it("renders a raw payload block for generic user messages with injected prompt context", () => {
    const rawText = `
<workspace-context>
project_root: /tmp/example
</workspace-context>

<tooling-context>
serena_project: multi-agent-ff15
</tooling-context>

Hello from User.
    `.trim();

    const markup = renderToStaticMarkup(
      <MessageDetailSheet
        content="Hello from User."
        messageRole="user"
        onOpenChange={() => undefined}
        open={true}
        parts={[{ type: "text", text: rawText }]}
        rawTextContent={rawText}
        senderLabel="User"
      />,
    );

    expect(markup).toContain("User message detail");
    expect(markup).toContain("Prompt Context");
    expect(markup).toContain("Injected");
    expect(markup).toContain("Workspace Context");
    expect(markup).toContain("Tooling Context");
    expect(markup).toContain("Raw Prompt Payload");
    expect(markup).toContain("project_root: /tmp/example");
    expect(markup).toContain("Hello from User.");
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
    expect(markup).toContain("Raw Prompt Payload");
    expect(markup).toContain("普通、集中");
  });

  it("does not render a raw payload block when the stored payload matches the visible body", () => {
    const rawText = "Plain visible reply from assistant.";

    const markup = renderToStaticMarkup(
      <MessageDetailSheet
        content="Plain visible reply from assistant."
        messageRole="assistant"
        onOpenChange={() => undefined}
        open={true}
        parts={[{ type: "text", text: rawText }]}
        rawTextContent={rawText}
        senderLabel="Assistant"
      />,
    );

    expect(markup).not.toContain("Raw Prompt Payload");
  });

  it("renders requested and actual selection details for adjusted assistant replies", () => {
    const markup = renderToStaticMarkup(
      <MessageDetailSheet
        content="Adjusted reply."
        messageDisplay={{
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
              model: {
                providerID: "github-copilot",
                modelID: "gpt-5-mini",
                variant: "high",
              },
            },
            actual: {
              agent: "Hephaestus (Deep Agent)",
              model: {
                providerID: "github-copilot",
                modelID: "gpt-5.4",
              },
            },
          },
          resolvedSender: null,
          resolvedSenderIsUser: false,
          resolvedSenderLabel: "Hephaestus (Deep Agent)",
          workflowPresentation: null,
        }}
        messageRole="assistant"
        onOpenChange={() => undefined}
        open={true}
        parts={[{ type: "text", text: "Adjusted reply." }]}
        rawTextContent="Adjusted reply."
        senderLabel="Hephaestus (Deep Agent)"
      />,
    );

    expect(markup).toContain("Selection Adjustment");
    expect(markup).toContain("Requested");
    expect(markup).toContain("Actual");
    expect(markup).toContain("Sisyphus (Ultraworker)");
    expect(markup).toContain("Hephaestus (Deep Agent)");
    expect(markup).toContain("github-copilot/gpt-5-mini (high)");
    expect(markup).toContain("github-copilot/gpt-5.4");
  });
});
