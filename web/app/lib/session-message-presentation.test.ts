import { describe, expect, it } from "vitest";
import type { MessageInfo } from "@/routes/_layout.opencode.session.$id/types";
import {
  buildRenderedSessionMessages,
  resolveSessionMessageDisplay,
  toSessionPresentationMessages,
  type SessionPresentationMessage,
} from "./session-message-presentation";

describe("session-message-presentation", () => {
  it("extracts workflow visible body and sender label from metadata", () => {
    const resolved = resolveSessionMessageDisplay({
      rawText: `
<operation-prompt>
<operation-note>
Child task returned.
</operation-note>

<instruction>
Integrate the worker result.
</instruction>

<worker-report from="ignis" to="noctis" next="COMPLETE">
普通、集中
</worker-report>
</operation-prompt>
      `.trim(),
      fallbackSender: null,
      fallbackSenderLabel: "Assistant",
    });

    expect(resolved.displayContent).toBe("普通、集中");
    expect(resolved.resolvedSenderLabel).toBe("Ignis");
    expect(resolved.resolvedSenderIsUser).toBe(false);
    expect(resolved.promptContextSource).toBe("workflow");
    expect(resolved.promptContextSections.map((section) => section.tagName)).toEqual([
      "operation-note",
      "instruction",
    ]);
    expect(resolved.rawPromptPayload).toContain("<operation-prompt>");
  });

  it("falls back to history sender label when workflow metadata does not specify a sender", () => {
    const resolved = resolveSessionMessageDisplay({
      rawText: `
<operation-prompt>
<instruction>
Continue the conversation.
</instruction>

<team-message>
Need more detail from User.
</team-message>
</operation-prompt>
      `.trim(),
      fallbackSender: null,
      fallbackSenderLabel: "noctis-cli",
    });

    expect(resolved.displayContent).toBe("Need more detail from User.");
    expect(resolved.resolvedSenderLabel).toBe("noctis-cli");
    expect(resolved.resolvedSenderIsUser).toBe(false);
    expect(resolved.promptContextSource).toBe("workflow");
    expect(resolved.promptContextSections.map((section) => section.tagName)).toEqual([
      "instruction",
    ]);
  });

  it("keeps injected generic session payload available when visible content differs", () => {
    const resolved = resolveSessionMessageDisplay({
      rawText: `
<workspace-context>
project_root: /tmp/example
</workspace-context>

<tooling-context>
serena_project: multi-agent-ff15
</tooling-context>

Hello from User.
      `.trim(),
      fallbackSender: "user",
      fallbackSenderLabel: "User",
    });

    expect(resolved.displayContent).toBe("Hello from User.");
    expect(resolved.promptContextSource).toBe("injected");
    expect(resolved.promptContextSections.map((section) => section.tagName)).toEqual([
      "workspace-context",
      "tooling-context",
    ]);
    expect(resolved.rawPromptPayload).toContain("<workspace-context>");
    expect(resolved.rawPromptPayload).toContain("Hello from User.");
  });

  it("omits raw prompt payload when persisted raw text matches visible body", () => {
    const resolved = resolveSessionMessageDisplay({
      rawText: "Plain visible reply.",
      fallbackSender: null,
      fallbackSenderLabel: "Assistant",
    });

    expect(resolved.displayContent).toBe("Plain visible reply.");
    expect(resolved.rawPromptPayload).toBeNull();
  });

  it("groups tool-only Noctis activity into the following visible Noctis reply", () => {
    const rendered = buildRenderedSessionMessages([
      {
        id: "tool-1",
        role: "assistant",
        sender: "noctis",
        senderLabel: "Noctis",
        kind: "assistant_message",
        content: "",
        detailContent: "",
        rawText: "",
        parts: [{ type: "tool", tool: "bash", state: { status: "completed" } }],
        timestamp: new Date("2026-04-04T10:00:00.000Z"),
        source: "session",
      },
      {
        id: "reply-1",
        role: "assistant",
        sender: "noctis",
        senderLabel: "Noctis",
        kind: "assistant_message",
        content: "了解。今、みんなに聞いている。",
        detailContent: "了解。今、みんなに聞いている。",
        rawText: "了解。今、みんなに聞いている。",
        parts: [{ type: "text", text: "了解。今、みんなに聞いている。" }],
        timestamp: new Date("2026-04-04T10:00:05.000Z"),
        source: "session",
      },
    ]);

    expect(rendered).toHaveLength(1);
    expect(rendered[0]?.messageDisplay.displayContent).toBe("了解。今、みんなに聞いている。");
    expect(rendered[0]?.parts.filter((part) => part.type === "tool")).toHaveLength(1);
    expect(rendered[0]?.detailRawText).toContain("了解。今、みんなに聞いている。");
  });

  it("keeps trailing Noctis intermediate activity visible as its own displayed message", () => {
    const rendered = buildRenderedSessionMessages([
      {
        id: "tool-1",
        role: "assistant",
        sender: "noctis",
        senderLabel: "Noctis",
        kind: "assistant_message",
        content: "",
        detailContent: "",
        rawText: "",
        parts: [{ type: "tool", tool: "bash", state: { status: "completed" } }],
        timestamp: new Date("2026-04-04T10:00:00.000Z"),
        source: "session",
      },
    ]);

    expect(rendered).toHaveLength(1);
    expect(rendered[0]?.intermediateOnly).toBe(true);
    expect(rendered[0]?.messageDisplay.displayContent).toBe("Tool activity: 1 event.");
    expect(rendered[0]?.senderLabel).toBe("Noctis");
  });

  it("does not merge pending Noctis activity into a later different displayed sender", () => {
    const rendered = buildRenderedSessionMessages([
      {
        id: "tool-1",
        role: "assistant",
        sender: "noctis",
        senderLabel: "Noctis",
        kind: "assistant_message",
        content: "",
        detailContent: "",
        rawText: "",
        parts: [{ type: "tool", tool: "bash", state: { status: "completed" } }],
        timestamp: new Date("2026-04-04T10:00:00.000Z"),
        source: "session",
      },
      {
        id: "worker-1",
        role: "assistant",
        sender: "ignis",
        senderLabel: "Ignis",
        kind: "team_message",
        content: "普通、集中",
        detailContent: "普通、集中",
        rawText: "普通、集中",
        parts: [{ type: "text", text: "普通、集中" }],
        timestamp: new Date("2026-04-04T10:00:05.000Z"),
        source: "session",
      },
    ]);

    expect(rendered).toHaveLength(2);
    expect(rendered[0]?.intermediateOnly).toBe(true);
    expect(rendered[1]?.senderLabel).toBe("Ignis");
    expect(rendered[1]?.messageDisplay.displayContent).toBe("普通、集中");
  });

  it("keeps opencode and noctis-team aligned for the same session history", () => {
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

    const opencodeMessages: MessageInfo[] = [
      {
        info: {
          id: "worker-1",
          role: "user",
          agent: "noctis",
          time: { created: Date.parse("2026-04-04T10:00:00.000Z") },
        },
        parts: [{ type: "text", text: rawPrompt }],
      },
    ];
    const noctisMessages: SessionPresentationMessage[] = [
      {
        id: "worker-1",
        role: "assistant",
        sender: "ignis",
        senderLabel: "Ignis",
        kind: "team_message",
        content: "Implemented the requested change.",
        detailContent: "Implemented the requested change.",
        rawText: rawPrompt,
        parts: [{ type: "text", text: rawPrompt }],
        timestamp: new Date("2026-04-04T10:00:00.000Z"),
        source: "session",
      },
    ];

    const opencodeRendered = buildRenderedSessionMessages(
      toSessionPresentationMessages(opencodeMessages),
    );
    const noctisRendered = buildRenderedSessionMessages(noctisMessages);

    expect(opencodeRendered).toHaveLength(1);
    expect(noctisRendered).toHaveLength(1);
    expect(opencodeRendered[0]?.messageDisplay.displayContent).toBe(
      noctisRendered[0]?.messageDisplay.displayContent,
    );
    expect(opencodeRendered[0]?.senderLabel).toBe(noctisRendered[0]?.senderLabel);
    expect(opencodeRendered[0]?.intermediateOnly).toBe(noctisRendered[0]?.intermediateOnly);
  });
});