import { describe, expect, it } from "vitest";
import { parseWorkflowMessagePresentation } from "./chat-workflow-presentation";

describe("chat-workflow-presentation", () => {
  it("extracts the visible user request and hidden workflow sections", () => {
    const presentation = parseWorkflowMessagePresentation(`
<operation-prompt>
<workspace-context>
project_root: /tmp/example
</workspace-context>

<tooling-context>
serena_project: multi-agent-ff15
</tooling-context>

<analyze-mode>
ANALYSIS MODE. Gather context before diving deep.
</analyze-mode>

<job>
Noctis Autonomous Orchestrator
</job>

<instruction>
1. Understand the request.
</instruction>

<user-request>
仲間たちに、今日の気分を聞いて
</user-request>
</operation-prompt>
    `);

    expect(presentation).toEqual({
      visibleBody: "仲間たちに、今日の気分を聞いて",
      reportDetails: null,
      workflowPromptSections: [
        {
          key: "workspace-context:0",
          tagName: "workspace-context",
          label: "Workspace Context",
          content: "project_root: /tmp/example",
          preview: "project_root: /tmp/example",
        },
        {
          key: "tooling-context:1",
          tagName: "tooling-context",
          label: "Tooling Context",
          content: "serena_project: multi-agent-ff15",
          preview: "serena_project: multi-agent-ff15",
        },
        {
          key: "analyze-mode:2",
          tagName: "analyze-mode",
          label: "Analyze Mode",
          content: "ANALYSIS MODE. Gather context before diving deep.",
          preview: "ANALYSIS MODE. Gather context before diving deep.",
        },
        {
          key: "job:3",
          tagName: "job",
          label: "Job",
          content: "Noctis Autonomous Orchestrator",
          preview: "Noctis Autonomous Orchestrator",
        },
        {
          key: "instruction:4",
          tagName: "instruction",
          label: "Instruction",
          content: "1. Understand the request.",
          preview: "1. Understand the request.",
        },
      ],
      rawPrompt: expect.stringContaining("<operation-prompt>"),
      usedFallback: false,
    });
  });

  it("extracts worker report details separately from the visible body", () => {
    const presentation = parseWorkflowMessagePresentation(`
<operation-prompt>
<worker-report>
Noctis、今日は気合十分だぜ。何があっても守る、任せろ。
</worker-report>

<worker-report-details>
Gladiolus also said he can cover logistics if needed.
</worker-report-details>

<delegation-guidance>
Stay in conversation with User.
</delegation-guidance>
</operation-prompt>
    `);

    expect(presentation?.visibleBody).toBe(
      "Noctis、今日は気合十分だぜ。何があっても守る、任せろ。",
    );
    expect(presentation?.reportDetails).toBe(
      "Gladiolus also said he can cover logistics if needed.",
    );
    expect(presentation?.workflowPromptSections.map((section) => section.tagName)).toEqual([
      "delegation-guidance",
    ]);
    expect(presentation?.usedFallback).toBe(false);
  });

  it("keeps hidden sections in the same order as the raw operation prompt", () => {
    const presentation = parseWorkflowMessagePresentation(`
<operation-prompt>
<workspace-context>
project_root: /tmp/example
</workspace-context>

<job>
Noctis Autonomous Orchestrator
</job>

<handoff>
from_step: gather
</handoff>

<instruction>
Follow the handoff.
</instruction>

<user-request>
Please continue.
</user-request>
</operation-prompt>
    `);

    expect(presentation?.workflowPromptSections.map((section) => section.tagName)).toEqual([
      "workspace-context",
      "job",
      "handoff",
      "instruction",
    ]);
  });

  it("falls back to the raw structured message when no visible body can be extracted", () => {
    const rawPrompt = `
<operation-prompt>
<job>
Noctis Autonomous Orchestrator
</job>
</operation-prompt>
    `.trim();
    const presentation = parseWorkflowMessagePresentation(rawPrompt);

    expect(presentation).toEqual({
      visibleBody: rawPrompt,
      reportDetails: null,
      workflowPromptSections: [],
      rawPrompt,
      usedFallback: true,
    });
  });

  it("returns null for plain chat messages", () => {
    expect(parseWorkflowMessagePresentation("Hello there")).toBeNull();
  });
});