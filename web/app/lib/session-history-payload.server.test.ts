import { describe, expect, it } from "vitest";
import { buildRenderedSessionMessages, toSessionPresentationMessages } from "./session-message-presentation";
import {
  sanitizeSessionMessages,
  type RawSessionMessage,
} from "./session-history-payload.server";

describe("session-history-payload.server", () => {
  it("preserves visible-body rendering and inspectability while dropping unused part metadata", () => {
    const messages: RawSessionMessage[] = [
      {
        info: {
          id: "assistant-1",
          role: "assistant",
          agent: "Noctis",
          parentID: "user-1",
          providerID: "github-copilot",
          modelID: "gpt-5.4",
          time: { created: Date.parse("2026-04-18T10:00:00.000Z") },
        },
        parts: [
          {
            type: "text",
            text: [
              "<operation-prompt>",
              "<instruction>",
              "Need more detail from User.",
              "</instruction>",
              "",
              '<team-message from="noctis" to="user">',
              "Need more detail from User.",
              "</team-message>",
              "</operation-prompt>",
            ].join("\n"),
            time: { created: 1 },
            id: "part-text-1",
          },
          {
            type: "reasoning",
            text: "I should ask User for more detail.",
            metadata: {
              openai: {
                largeReasoningTrace: "discard-me",
              },
            },
            sessionID: "session-1",
            messageID: "assistant-1",
            id: "part-reasoning-1",
            time: { created: 2 },
          },
          {
            type: "tool",
            tool: "apply_patch",
            state: {
              status: "completed",
              input: {
                input: "*** Begin Patch\n*** End Patch",
              },
              output: "patched",
              error: "",
              ignored: "discard-me",
            },
            metadata: {
              provider: "openai",
            },
            time: { created: 3 },
            id: "part-tool-1",
          },
        ],
      },
    ];

    const sanitized = sanitizeSessionMessages(messages, {});
    const rendered = buildRenderedSessionMessages(toSessionPresentationMessages(sanitized));

    expect(rendered).toHaveLength(1);
    expect(rendered[0]?.messageDisplay.displayContent).toBe("Need more detail from User.");
    expect(rendered[0]?.messageDisplay.promptContextSections.map((section) => section.tagName)).toEqual([
      "instruction",
    ]);

    const reasoningPart = rendered[0]?.parts.find((part) => part.type === "reasoning");
    expect(reasoningPart).toEqual({
      type: "reasoning",
      text: "I should ask User for more detail.",
    });

    const toolPart = rendered[0]?.parts.find((part) => part.type === "tool");
    expect(toolPart).toEqual({
      type: "tool",
      tool: "apply_patch",
      state: {
        status: "completed",
        input: {
          input: "*** Begin Patch\n*** End Patch",
        },
        output: "patched",
        error: "",
      },
      detailId: expect.any(String),
      sourceMessageId: "assistant-1",
    });
  });

  it("preserves tracked selection adjustments while sanitizing message parts", () => {
    const sanitized = sanitizeSessionMessages(
      [
        {
          info: {
            id: "assistant-1",
            role: "assistant",
            agent: "Hephaestus (Deep Agent)",
            parentID: "user-1",
            providerID: "github-copilot",
            modelID: "gpt-5.4",
            time: { created: Date.parse("2026-04-18T10:00:05.000Z") },
          },
          parts: [
            {
              type: "text",
              text: "Adjusted reply.",
              metadata: { ignored: true },
            },
          ],
        },
      ],
      {
        "user-1": {
          requested: {
            agent: "Sisyphus (Ultraworker)",
            model: {
              providerID: "github-copilot",
              modelID: "gpt-5-mini",
              variant: "high",
            },
          },
        },
      },
    );

    expect(sanitized[0]?.info.selectionAdjustment).toMatchObject({
      explanation: "Runtime adjusted the requested selection before recording this reply.",
      requested: {
        agent: "Sisyphus (Ultraworker)",
      },
      actual: {
        agent: "Hephaestus (Deep Agent)",
      },
    });
    expect(sanitized[0]?.parts).toEqual([{ type: "text", text: "Adjusted reply." }]);
  });

  it("returns compact summary payloads for transcript-first history responses", () => {
    const sanitized = sanitizeSessionMessages(
      [
        {
          info: {
            id: "assistant-summary-1",
            role: "assistant",
            agent: "Noctis",
            providerID: "github-copilot",
            modelID: "gpt-5.4",
            time: { created: Date.parse("2026-04-22T10:00:00.000Z") },
          },
          parts: [
            {
              type: "text",
              text: "Summary body.",
            },
            {
              type: "reasoning",
              text: "Long reasoning that can stay summarized.",
            },
            {
              type: "tool",
              tool: "apply_patch",
              state: {
                status: "completed",
                input: {
                  huge: "discard-me",
                },
                output: "discard-me",
                error: "",
              },
            },
          ],
        },
      ],
      {},
      { detailState: "summary" },
    );

    expect(sanitized[0]?.detailState).toBe("summary");
    expect(sanitized[0]?.summary).toMatchObject({
      content: "Summary body.",
    });
    expect(sanitized[0]?.parts).toEqual([
      {
        type: "reasoning",
        text: "Long reasoning that can stay summarized.",
      },
      {
        type: "tool",
        tool: "apply_patch",
        state: {
          status: "completed",
        },
      },
    ]);
  });

  it("preserves assistant top-level errors and renders aborted replies", () => {
    const sanitized = sanitizeSessionMessages(
      [
        {
          info: {
            id: "assistant-2",
            role: "assistant",
            agent: "build",
            providerID: "github-copilot",
            modelID: "gpt-5.4-mini",
            time: { created: Date.parse("2026-04-22T00:45:08.378Z") },
            error: {
              name: "MessageAbortedError",
              data: {
                message: "Aborted",
              },
            },
          },
          parts: [],
        },
      ],
      {},
    );

    expect(sanitized[0]?.info.error).toEqual({
      name: "MessageAbortedError",
      message: "Aborted",
    });

    const rendered = buildRenderedSessionMessages(toSessionPresentationMessages(sanitized));

    expect(rendered).toHaveLength(1);
    expect(rendered[0]?.messageDisplay.displayContent).toBe("Response interrupted: Aborted");
    expect(rendered[0]?.senderLabel).toBe("build");
  });
});