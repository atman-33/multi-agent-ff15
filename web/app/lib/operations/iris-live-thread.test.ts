import { describe, expect, it } from "vitest";
import {
  buildOperationsIrisLiveDraft,
  buildOperationsIrisStreamingText,
  createOperationsIrisOptimisticMessage,
  mergeOperationsIrisStreamingState,
  shouldClearOperationsIrisOptimisticMessage,
  shouldUseOperationsIrisPollingFallback,
} from "./iris-live-thread";

describe("operations iris-live-thread", () => {
  it("creates an optimistic user message from prompt parts for immediate presentation", () => {
    const optimistic = createOperationsIrisOptimisticMessage({
      baselineMessageCount: 2,
      parts: [
        { type: "text", text: "Revise the selected step." },
        { type: "file", path: "docs/notes.md", content: "Step notes" },
      ],
      timestamp: new Date("2026-04-18T00:00:00.000Z"),
    });

    expect(optimistic.baselineMessageCount).toBe(2);
    expect(optimistic.message.role).toBe("user");
    expect(optimistic.message.sender).toBe("user");
    expect(optimistic.message.senderLabel).toBe("User");
    expect(optimistic.message.content).toContain("Revise the selected step.");
    expect(optimistic.message.content).toContain("@docs/notes.md");
  });

  it("clears the optimistic message once authoritative history grows past its baseline", () => {
    const optimistic = createOperationsIrisOptimisticMessage({
      baselineMessageCount: 2,
      parts: [{ type: "text", text: "Revise the selected step." }],
    });

    expect(shouldClearOperationsIrisOptimisticMessage(optimistic, 2)).toBe(false);
    expect(shouldClearOperationsIrisOptimisticMessage(optimistic, 3)).toBe(true);
  });

  it("builds Iris streaming text input for the shared render snapshot", () => {
    expect(buildOperationsIrisStreamingText("")).toBeNull();

    expect(buildOperationsIrisStreamingText("Working through the revision.")).toEqual({
      content: "Working through the revision.",
      fallbackSender: "iris",
      fallbackSenderLabel: "Iris",
    });
  });

  it("builds a live draft input for shared Iris rendering", () => {
    expect(
      buildOperationsIrisLiveDraft({
        messageId: "assistant-1",
        parts: [{ text: "Thinking through the revision", type: "reasoning" }],
        sessionId: "session-iris-1",
      }),
    ).toEqual({
      fallbackSender: "iris",
      fallbackSenderLabel: "Iris",
      messageId: "assistant-1",
      parts: [{ text: "Thinking through the revision", type: "reasoning" }],
    });

    expect(
      buildOperationsIrisLiveDraft({
        messageId: "assistant-1",
        parts: undefined,
        sessionId: "session-iris-1",
      }),
    ).toBeNull();
  });

  it("merges streaming text-part updates until a new assistant message starts", () => {
    expect(
      mergeOperationsIrisStreamingState({
        currentContent: "Working through",
        currentMessageId: "assistant-1",
        nextMessageId: "assistant-1",
        nextText: " the revision.",
      }),
    ).toEqual({
      content: "Working through the revision.",
      messageId: "assistant-1",
    });

    expect(
      mergeOperationsIrisStreamingState({
        currentContent: "Working through the revision.",
        currentMessageId: "assistant-1",
        nextMessageId: "assistant-2",
        nextText: "Starting a fresh answer.",
      }),
    ).toEqual({
      content: "Starting a fresh answer.",
      messageId: "assistant-2",
    });
  });

  it("enables polling fallback only while an Iris session is active and live events are unavailable", () => {
    expect(
      shouldUseOperationsIrisPollingFallback({
        isLiveUnavailable: false,
        sessionId: "session-iris-1",
        sessionStatus: "busy",
      }),
    ).toBe(false);

    expect(
      shouldUseOperationsIrisPollingFallback({
        isLiveUnavailable: true,
        sessionId: "session-iris-1",
        sessionStatus: "busy",
      }),
    ).toBe(true);

    expect(
      shouldUseOperationsIrisPollingFallback({
        isLiveUnavailable: true,
        sessionId: "session-iris-1",
        sessionStatus: "idle",
      }),
    ).toBe(false);

    expect(
      shouldUseOperationsIrisPollingFallback({
        isLiveUnavailable: true,
        sessionId: null,
        sessionStatus: "busy",
      }),
    ).toBe(false);
  });
});