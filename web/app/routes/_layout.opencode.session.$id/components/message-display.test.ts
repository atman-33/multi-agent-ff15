import { describe, expect, it } from "vitest";
import { resolveSessionMessageDisplay } from "./message-display";

describe("resolveSessionMessageDisplay", () => {
  it("extracts workflow visible body and sender label from from metadata", () => {
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

  it("falls back to history sender label when workflow from metadata is absent", () => {
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

  it("keeps injected shared context in raw payload when visible text differs", () => {
    const resolved = resolveSessionMessageDisplay({
      rawText: `
<workspace-context>
project_root: /tmp/example
</workspace-context>

Hello from User.
      `.trim(),
      fallbackSender: "user",
      fallbackSenderLabel: "User",
    });

    expect(resolved.displayContent).toBe("Hello from User.");
    expect(resolved.promptContextSource).toBe("injected");
    expect(resolved.rawPromptPayload).toContain("<workspace-context>");
  });

  it("does not expose raw payload when the message text is already visible", () => {
    const resolved = resolveSessionMessageDisplay({
      rawText: "Plain visible reply.",
      fallbackSender: null,
      fallbackSenderLabel: "Assistant",
    });

    expect(resolved.rawPromptPayload).toBeNull();
  });
});