// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionPresentationMessage } from "@/lib/session-message-presentation";
import { useSessionChatRenderSnapshot } from "./use-session-chat-render-snapshot";

type SnapshotHarnessProps = {
  currentStreamingMessageId?: string | null;
  liveDraft?: {
    fallbackSender: SessionPresentationMessage["sender"];
    fallbackSenderLabel: string;
    messageId: string | null;
    parts: NonNullable<SessionPresentationMessage["parts"]>;
  } | null;
  messages: SessionPresentationMessage[];
  onStreamingMessageCommitted?: (messageId: string) => void;
};

function SnapshotHarness({
  currentStreamingMessageId = null,
  liveDraft = null,
  messages,
  onStreamingMessageCommitted,
}: SnapshotHarnessProps) {
  useSessionChatRenderSnapshot({
    currentStreamingMessageId,
    liveDraft,
    messages,
    onStreamingMessageCommitted,
  });

  return null;
}

describe("use-session-chat-render-snapshot", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    root = null;
    container?.remove();
    container = null;
  });

  it("notifies once when authoritative history commits the current live message", async () => {
    const onStreamingMessageCommitted = vi.fn();
    const messages: SessionPresentationMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        sender: "iris",
        senderLabel: "Iris",
        kind: "assistant_message",
        content: "Registry refreshed.",
        detailContent: "Registry refreshed.",
        rawText: "Registry refreshed.",
        parts: [{ type: "text", text: "Registry refreshed." }],
        timestamp: new Date("2026-04-25T09:00:00.000Z"),
        source: "session",
      },
    ];

    container = document.createElement("div");
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(SnapshotHarness, {
          currentStreamingMessageId: "assistant-1",
          liveDraft: {
            fallbackSender: "iris",
            fallbackSenderLabel: "Iris",
            messageId: "assistant-1",
            parts: [{ type: "text", text: "Registry refreshed." }],
          },
          messages,
          onStreamingMessageCommitted,
        }),
      );
    });

    await act(async () => {
      root?.render(
        createElement(SnapshotHarness, {
          currentStreamingMessageId: "assistant-1",
          liveDraft: {
            fallbackSender: "iris",
            fallbackSenderLabel: "Iris",
            messageId: "assistant-1",
            parts: [{ type: "text", text: "Registry refreshed." }],
          },
          messages,
          onStreamingMessageCommitted,
        }),
      );
    });

    expect(onStreamingMessageCommitted).toHaveBeenCalledTimes(1);
    expect(onStreamingMessageCommitted).toHaveBeenCalledWith("assistant-1");
  });
});