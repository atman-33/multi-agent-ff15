import { describe, expect, it } from "vitest";
import type { SessionPresentationMessage } from "@/lib/session-message-presentation";
import {
  buildProjectIrisStreamingText,
  mergeProjectIrisStreamingMessage,
  shouldUseProjectIrisPollingFallback,
} from "./iris-live-thread";

function createAssistantMessage(overrides: Partial<SessionPresentationMessage> = {}): SessionPresentationMessage {
  return {
    id: overrides.id ?? "assistant-1",
    role: "assistant",
    sender: overrides.sender ?? "iris",
    senderLabel: overrides.senderLabel ?? "Iris",
    kind: overrides.kind ?? "assistant_message",
    content: overrides.content ?? "Hel",
    detailContent: overrides.detailContent ?? "Hel",
    rawText: overrides.rawText ?? "Hel",
    parts: overrides.parts ?? [{ type: "text", text: "Hel" }],
    timestamp: overrides.timestamp ?? new Date("2026-04-22T00:00:00.000Z"),
    source: overrides.source ?? "session",
  };
}

describe("project-management iris live-thread helpers", () => {
  it("builds shared streaming text metadata for Iris", () => {
    expect(buildProjectIrisStreamingText("Refreshing registry")).toEqual({
      content: "Refreshing registry",
      fallbackSender: "iris",
      fallbackSenderLabel: "Iris",
    });
    expect(buildProjectIrisStreamingText("")).toBeNull();
  });

  it("merges streaming text into an authoritative Iris message", () => {
    const merged = mergeProjectIrisStreamingMessage(createAssistantMessage(), "Hello");

    expect(merged.content).toBe("Hello");
    expect(merged.detailContent).toBe("Hello");
    expect(merged.rawText).toBe("Hello");
    expect(merged.parts).toEqual([{ type: "text", text: "Hello" }]);
  });

  it("uses polling fallback only while a live Iris session is active and unavailable", () => {
    expect(
      shouldUseProjectIrisPollingFallback({
        isLiveUnavailable: true,
        sessionId: "session-project-iris-1",
        sessionStatus: "busy",
      }),
    ).toBe(true);
    expect(
      shouldUseProjectIrisPollingFallback({
        isLiveUnavailable: false,
        sessionId: "session-project-iris-1",
        sessionStatus: "busy",
      }),
    ).toBe(false);
    expect(
      shouldUseProjectIrisPollingFallback({
        isLiveUnavailable: true,
        sessionId: "session-project-iris-1",
        sessionStatus: "idle",
      }),
    ).toBe(false);
  });
});