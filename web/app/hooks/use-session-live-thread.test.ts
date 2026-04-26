// @vitest-environment jsdom

import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessagePart } from "@/lib/opencode-session-types";
import { mergeStreamingText } from "@/lib/session-stream";
import { useSessionLiveThread } from "./use-session-live-thread";

type MessageRecord = {
  content: string;
  id: string;
};

type HookSnapshot = {
  isLiveUnavailable: boolean;
  liveDraft: {
    messageId: string | null;
    parts: MessagePart[];
    sessionId: string | null;
  } | null;
  messages: MessageRecord[];
  streamingContent: string;
  streamingMessageId: string | null;
};

class MockEventSource {
  static instances: MockEventSource[] = [];

  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  onmessage: ((this: EventSource, ev: MessageEvent<string>) => unknown) | null = null;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close(): void {
    // no-op
  }
}

function HookProbe({
  initialMessages = [],
  onIdle,
  onSnapshot,
  sessionId,
}: {
  initialMessages?: MessageRecord[];
  onIdle?: (sessionId: string) => void;
  onSnapshot: (snapshot: HookSnapshot) => void;
  sessionId: string | null;
}) {
  const [messages, setMessages] = useState<MessageRecord[]>(initialMessages);
  const liveThread = useSessionLiveThread({
    onSessionIdle: onIdle,
    onTextPartMatched: ({ messageId, text }) => {
      if (!messageId) {
        return false;
      }

      let matched = false;
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== messageId) {
            return message;
          }

          matched = true;
          return {
            ...message,
            content: mergeStreamingText(message.content, text),
          };
        }),
      );

      return matched;
    },
    sessionId,
  });

  useEffect(() => {
    onSnapshot({
      isLiveUnavailable: liveThread.isLiveUnavailable,
      liveDraft: liveThread.liveDraft,
      messages,
      streamingContent: liveThread.streamingContent,
      streamingMessageId: liveThread.streamingMessageId,
    });
  }, [liveThread.isLiveUnavailable, liveThread.liveDraft, liveThread.streamingContent, liveThread.streamingMessageId, messages, onSnapshot]);

  return null;
}

describe("useSessionLiveThread", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container.remove();
    vi.unstubAllGlobals();
  });

  it("builds one streaming assistant reply from incremental text-part updates", async () => {
    let latestSnapshot: HookSnapshot | null = null;
    const getSnapshot = () => {
      if (!latestSnapshot) {
        throw new Error("Hook snapshot was not captured.");
      }

      return latestSnapshot;
    };

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          onSnapshot: (snapshot: HookSnapshot) => {
            latestSnapshot = snapshot;
          },
          sessionId: "session-1",
        }),
      );
    });

    const eventSource = MockEventSource.instances[0];
    if (!eventSource?.onmessage) {
      throw new Error("EventSource handler was not registered.");
    }
    const handleMessage = eventSource.onmessage;

    await act(async () => {
      handleMessage.call(eventSource as unknown as EventSource, {
        data: JSON.stringify({
          properties: {
            part: {
              messageID: "assistant-1",
              sessionID: "session-1",
              text: "Hel",
              type: "text",
            },
          },
          type: "message.part.updated",
        }),
      } as MessageEvent<string>);
    });

    expect(getSnapshot().streamingMessageId).toBe("assistant-1");
    expect(getSnapshot().streamingContent).toBe("Hel");

    await act(async () => {
      handleMessage.call(eventSource as unknown as EventSource, {
        data: JSON.stringify({
          properties: {
            part: {
              messageID: "assistant-1",
              sessionID: "session-1",
              text: "Hello",
              type: "text",
            },
          },
          type: "message.part.updated",
        }),
      } as MessageEvent<string>);
    });

    expect(getSnapshot().streamingContent).toBe("Hello");
  });

  it("merges into an existing authoritative message and clears temporary streaming state", async () => {
    let latestSnapshot: HookSnapshot | null = null;
    const getSnapshot = () => {
      if (!latestSnapshot) {
        throw new Error("Hook snapshot was not captured.");
      }

      return latestSnapshot;
    };

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          initialMessages: [{ content: "Hel", id: "assistant-1" }],
          onSnapshot: (snapshot: HookSnapshot) => {
            latestSnapshot = snapshot;
          },
          sessionId: "session-1",
        }),
      );
    });

    const eventSource = MockEventSource.instances[0];
    if (!eventSource?.onmessage) {
      throw new Error("EventSource handler was not registered.");
    }
    const handleMessage = eventSource.onmessage;

    await act(async () => {
      handleMessage.call(eventSource as unknown as EventSource, {
        data: JSON.stringify({
          properties: {
            part: {
              messageID: "assistant-1",
              sessionID: "session-1",
              text: "Hello",
              type: "text",
            },
          },
          type: "message.part.updated",
        }),
      } as MessageEvent<string>);
    });

    expect(getSnapshot().messages).toEqual([{ content: "Hello", id: "assistant-1" }]);
    expect(getSnapshot().streamingMessageId).toBeNull();
    expect(getSnapshot().streamingContent).toBe("");
  });

  it("clears temporary state on session idle and marks live events unavailable on stream error", async () => {
    const idleSpy = vi.fn();
    let latestSnapshot: HookSnapshot | null = null;
    const getSnapshot = () => {
      if (!latestSnapshot) {
        throw new Error("Hook snapshot was not captured.");
      }

      return latestSnapshot;
    };

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          onIdle: idleSpy,
          onSnapshot: (snapshot: HookSnapshot) => {
            latestSnapshot = snapshot;
          },
          sessionId: "session-1",
        }),
      );
    });

    const eventSource = MockEventSource.instances[0];
    if (!eventSource?.onmessage || !eventSource.onerror) {
      throw new Error("EventSource handlers were not registered.");
    }
    const handleMessage = eventSource.onmessage;
    const handleError = eventSource.onerror;

    await act(async () => {
      handleMessage.call(eventSource as unknown as EventSource, {
        data: JSON.stringify({
          properties: {
            part: {
              messageID: "assistant-1",
              sessionID: "session-1",
              text: "Working",
              type: "text",
            },
          },
          type: "message.part.updated",
        }),
      } as MessageEvent<string>);
    });

    expect(getSnapshot().streamingContent).toBe("Working");

    await act(async () => {
      handleMessage.call(eventSource as unknown as EventSource, {
        data: JSON.stringify({
          properties: {
            sessionID: "session-1",
          },
          type: "session.idle",
        }),
      } as MessageEvent<string>);
    });

    expect(idleSpy).toHaveBeenCalledWith("session-1");
    expect(getSnapshot().streamingMessageId).toBeNull();
    expect(getSnapshot().streamingContent).toBe("");

    await act(async () => {
      handleError.call(eventSource as unknown as EventSource, new Event("error"));
    });

    expect(getSnapshot().isLiveUnavailable).toBe(true);
  });

  it("accumulates a reasoning part into the live draft", async () => {
    let latestSnapshot: HookSnapshot | null = null;
    const getSnapshot = () => {
      if (!latestSnapshot) {
        throw new Error("Hook snapshot was not captured.");
      }

      return latestSnapshot;
    };

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          onSnapshot: (snapshot: HookSnapshot) => {
            latestSnapshot = snapshot;
          },
          sessionId: "session-1",
        }),
      );
    });

    const eventSource = MockEventSource.instances[0];
    if (!eventSource?.onmessage) {
      throw new Error("EventSource handler was not registered.");
    }

    await act(async () => {
      eventSource.onmessage?.call(eventSource as unknown as EventSource, {
        data: JSON.stringify({
          properties: {
            part: {
              id: "part-1",
              messageID: "assistant-1",
              sessionID: "session-1",
              text: "Thinking through the next step",
              time: {
                start: 1,
              },
              type: "reasoning",
            },
          },
          type: "message.part.updated",
        }),
      } as MessageEvent<string>);
    });

    expect(getSnapshot().liveDraft).toEqual({
      messageId: "assistant-1",
      parts: [{ text: "Thinking through the next step", type: "reasoning" }],
      sessionId: "session-1",
    });
    expect(getSnapshot().streamingContent).toBe("");
    expect(getSnapshot().streamingMessageId).toBe("assistant-1");
  });

  it("accumulates text and reasoning into one live draft by message identity", async () => {
    let latestSnapshot: HookSnapshot | null = null;
    const getSnapshot = () => {
      if (!latestSnapshot) {
        throw new Error("Hook snapshot was not captured.");
      }

      return latestSnapshot;
    };

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          onSnapshot: (snapshot: HookSnapshot) => {
            latestSnapshot = snapshot;
          },
          sessionId: "session-1",
        }),
      );
    });

    const eventSource = MockEventSource.instances[0];
    if (!eventSource?.onmessage) {
      throw new Error("EventSource handler was not registered.");
    }

    await act(async () => {
      eventSource.onmessage?.call(eventSource as unknown as EventSource, {
        data: JSON.stringify({
          properties: {
            part: {
              id: "part-1",
              messageID: "assistant-1",
              sessionID: "session-1",
              text: "Thinking through the next step",
              time: {
                start: 1,
              },
              type: "reasoning",
            },
          },
          type: "message.part.updated",
        }),
      } as MessageEvent<string>);
    });

    await act(async () => {
      eventSource.onmessage?.call(eventSource as unknown as EventSource, {
        data: JSON.stringify({
          properties: {
            part: {
              id: "part-2",
              messageID: "assistant-1",
              sessionID: "session-1",
              text: "Hello",
              type: "text",
            },
          },
          type: "message.part.updated",
        }),
      } as MessageEvent<string>);
    });

    expect(getSnapshot().liveDraft).toEqual({
      messageId: "assistant-1",
      parts: [
        { text: "Thinking through the next step", type: "reasoning" },
        { text: "Hello", type: "text" },
      ],
      sessionId: "session-1",
    });
    expect(getSnapshot().streamingContent).toBe("Hello");
    expect(getSnapshot().streamingMessageId).toBe("assistant-1");
  });
});