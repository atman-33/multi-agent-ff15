import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildIntermediateDetailSummary,
  MessageIntermediateDetails,
} from "./message-intermediate-details";

describe("message-intermediate-details", () => {
  it("includes workflow prompt and report details in the summary", () => {
    expect(
      buildIntermediateDetailSummary(
        null,
        "",
        [],
        "Detailed worker report",
        [
          {
            key: "instruction:0",
            tagName: "instruction",
            label: "Instruction",
            content: "Do the thing.",
            preview: "Do the thing.",
          },
        ],
      ),
    ).toBe("report details · workflow prompt");
  });

  it("renders workflow prompt sections and report details", () => {
    const markup = renderToStaticMarkup(
      <MessageIntermediateDetails
        internalContext={null}
        reasoning=""
        reportDetails="Gladio can cover logistics if needed."
        tools={[]}
        workflowPromptSections={[
          {
            key: "workspace-context:0",
            tagName: "workspace-context",
            label: "Workspace Context",
            content: "project_root: /tmp/example",
            preview: "project_root: /tmp/example",
          },
          {
            key: "analyze-mode:1",
            tagName: "analyze-mode",
            label: "Analyze Mode",
            content: "Gather context before coding.",
            preview: "Gather context before coding.",
          },
          {
            key: "instruction:2",
            tagName: "instruction",
            label: "Instruction",
            content: "Implement the visible body extraction.",
            preview: "Implement the visible body extraction.",
          },
        ]}
      />,
    );

    expect(markup).toContain("Workflow Prompt");
    expect(markup).toContain("Report Details");
    expect(markup).toContain("Workspace Context");
    expect(markup).toContain("Analyze Mode");
    expect(markup).toContain("Instruction");
    expect(markup).toContain("Gladio can cover logistics if needed.");
  });
});