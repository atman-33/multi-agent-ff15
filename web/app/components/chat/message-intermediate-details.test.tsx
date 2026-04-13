import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildIntermediateDetailSummary,
  MessageIntermediateDetails,
} from "./message-intermediate-details";

describe("message-intermediate-details", () => {
  it("includes prompt context and report details in the summary", () => {
    expect(
      buildIntermediateDetailSummary(
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
            source: "workflow",
          },
        ],
      ),
    ).toBe("report details · prompt context");
  });

  it("renders prompt context sections, source qualifier, and report details", () => {
    const markup = renderToStaticMarkup(
      <MessageIntermediateDetails
        reasoning=""
        reportDetails="Gladio can cover logistics if needed."
        tools={[]}
        promptContextSections={[
          {
            key: "workspace-context:0",
            tagName: "workspace-context",
            label: "Workspace Context",
            content: "project_root: /tmp/example",
            preview: "project_root: /tmp/example",
            source: "workflow",
          },
          {
            key: "analyze-mode:1",
            tagName: "analyze-mode",
            label: "Analyze Mode",
            content: "Gather context before coding.",
            preview: "Gather context before coding.",
            source: "workflow",
          },
          {
            key: "instruction:2",
            tagName: "instruction",
            label: "Instruction",
            content: "Implement the visible body extraction.",
            preview: "Implement the visible body extraction.",
            source: "workflow",
          },
        ]}
        promptContextSource="workflow"
      />,
    );

    expect(markup).toContain("Prompt Context");
    expect(markup).toContain("Operation");
    expect(markup).toContain("Report Details");
    expect(markup).toContain("Workspace Context");
    expect(markup).toContain("Analyze Mode");
    expect(markup).toContain("Instruction");
    expect(markup).toContain("Gladio can cover logistics if needed.");
    expect(markup).not.toContain("Internal Context");
  });
});