import { describe, expect, it } from "vitest";
import {
  parseInjectedPromptContextSections,
  parseWorkflowMessagePresentation,
} from "./chat-workflow-presentation";

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

<user-request from="user" to="noctis">
仲間たちに、今日の気分を聞いて
</user-request>
</operation-prompt>
    `);

    expect(presentation).toEqual({
      visibleBody: "仲間たちに、今日の気分を聞いて",
      visibleBodyFrom: "user",
      visibleBodyTo: "noctis",
      reportDetails: null,
      promptContextSections: [
        {
          key: "workspace-context:0",
          tagName: "workspace-context",
          label: "Workspace Context",
          content: "project_root: /tmp/example",
          preview: "project_root: /tmp/example",
          source: "workflow",
        },
        {
          key: "tooling-context:1",
          tagName: "tooling-context",
          label: "Tooling Context",
          content: "serena_project: multi-agent-ff15",
          preview: "serena_project: multi-agent-ff15",
          source: "workflow",
        },
        {
          key: "analyze-mode:2",
          tagName: "analyze-mode",
          label: "Analyze Mode",
          content: "ANALYSIS MODE. Gather context before diving deep.",
          preview: "ANALYSIS MODE. Gather context before diving deep.",
          source: "workflow",
        },
        {
          key: "job:3",
          tagName: "job",
          label: "Job",
          content: "Noctis Autonomous Orchestrator",
          preview: "Noctis Autonomous Orchestrator",
          source: "workflow",
        },
        {
          key: "instruction:4",
          tagName: "instruction",
          label: "Instruction",
          content: "1. Understand the request.",
          preview: "1. Understand the request.",
          source: "workflow",
        },
      ],
      rawPrompt: expect.stringContaining("<operation-prompt>"),
      usedFallback: false,
    });
  });

  it("extracts worker report sender metadata and keeps non-visible sections hidden", () => {
    const presentation = parseWorkflowMessagePresentation(`
<operation-prompt>
<worker-report from="gladiolus" to="noctis">
Noctis、今日は気合十分だぜ。何があっても守る、任せろ。

Gladiolus also said he can cover logistics if needed.
</worker-report>

<legacy-note>
This should stay hidden from the visible body.
</legacy-note>

<delegation-guidance>
Stay in conversation with User.
</delegation-guidance>
</operation-prompt>
    `);

    expect(presentation?.visibleBody).toBe(
      [
        "Noctis、今日は気合十分だぜ。何があっても守る、任せろ。",
        "Gladiolus also said he can cover logistics if needed.",
      ].join("\n\n"),
    );
    expect(presentation?.visibleBodyFrom).toBe("gladiolus");
    expect(presentation?.visibleBodyTo).toBe("noctis");
    expect(presentation?.reportDetails).toBeNull();
    expect(presentation?.promptContextSections.map((section) => section.tagName)).toEqual([
      "legacy-note",
      "delegation-guidance",
    ]);
    expect(presentation?.usedFallback).toBe(false);
  });

  it("keeps reading legacy worker-report-details during transition", () => {
    const presentation = parseWorkflowMessagePresentation(`
<operation-prompt>
<worker-report from="ignis" to="noctis">
Implemented the requested change.
</worker-report>

<worker-report-details>
Legacy details block.
</worker-report-details>
</operation-prompt>
    `);

    expect(presentation?.visibleBody).toBe("Implemented the requested change.");
    expect(presentation?.visibleBodyFrom).toBe("ignis");
    expect(presentation?.visibleBodyTo).toBe("noctis");
    expect(presentation?.reportDetails).toBe("Legacy details block.");
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

<user-request from="user" to="noctis">
Please continue.
</user-request>
</operation-prompt>
    `);

    expect(presentation?.promptContextSections.map((section) => section.tagName)).toEqual([
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
      visibleBodyFrom: null,
      visibleBodyTo: null,
      reportDetails: null,
      promptContextSections: [],
      rawPrompt,
      usedFallback: true,
    });
  });

  it("extracts injected prompt context sections for generic session messages", () => {
    expect(
      parseInjectedPromptContextSections(`
<workspace-context>
project_root: /tmp/example
</workspace-context>

<tooling-context>
serena_project: multi-agent-ff15
</tooling-context>

Hello from User
      `),
    ).toEqual([
      {
        key: "workspace-context:0",
        tagName: "workspace-context",
        label: "Workspace Context",
        content: "project_root: /tmp/example",
        preview: "project_root: /tmp/example",
        source: "injected",
      },
      {
        key: "tooling-context:1",
        tagName: "tooling-context",
        label: "Tooling Context",
        content: "serena_project: multi-agent-ff15",
        preview: "serena_project: multi-agent-ff15",
        source: "injected",
      },
    ]);
  });

  it("ignores unknown or incomplete injected prompt metadata safely", () => {
    expect(
      parseInjectedPromptContextSections(`
<workspace-context>
project_root: /tmp/example

<custom-context>
do not render me
</custom-context>
      `),
    ).toEqual([]);
  });

  it("returns null for plain chat messages", () => {
    expect(parseWorkflowMessagePresentation("Hello there")).toBeNull();
  });
});