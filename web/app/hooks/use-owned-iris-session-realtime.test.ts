// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStatus } from "@/lib/session-status";
import { useOwnedIrisSessionRealtime } from "./use-owned-iris-session-realtime";

type HookSnapshot = {
  isLiveUnavailable: boolean;
  sessionStatus: SessionStatus | null;
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

function createStatusesResponse(statuses: Record<string, SessionStatus>) {
  return {
    json: async () => ({ statuses }),
    ok: true,
  };
}

function HookProbe({
  loadMessages,
  onIdle,
  onSnapshot,
  sessionId,
}: {
  loadMessages: (sessionId: string) => Promise<void>;
  onIdle?: (sessionId: string) => void | Promise<void>;
  onSnapshot: (snapshot: HookSnapshot) => void;
  sessionId: string | null;
}) {
  const realtime = useOwnedIrisSessionRealtime({
    loadMessages,
    onSessionIdle: onIdle,
    sessionId,
  });

  useEffect(() => {
    onSnapshot({
      isLiveUnavailable: realtime.isLiveUnavailable,
      sessionStatus: realtime.sessionStatus,
      streamingContent: realtime.streamingContent,
      streamingMessageId: realtime.streamingMessageId,
    });
  }, [
    onSnapshot,
    realtime.isLiveUnavailable,
    realtime.sessionStatus,
    realtime.streamingContent,
    realtime.streamingMessageId,
  ]);

  return null;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("useOwnedIrisSessionRealtime", () => {
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("bootstraps the owner-aware session status and reloads authoritative messages on idle", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createStatusesResponse({ "session-1": "busy" }));
    const loadMessages = vi.fn().mockResolvedValue(undefined);
    const idleSpy = vi.fn();
    let latestSnapshot: HookSnapshot | null = null;

    const getSnapshot = () => {
      if (!latestSnapshot) {
        throw new Error("Hook snapshot was not captured.");
      }

      return latestSnapshot;
    };

    vi.stubGlobal("fetch", fetchMock);

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          loadMessages,
          onIdle: idleSpy,
          onSnapshot: (snapshot: HookSnapshot) => {
            latestSnapshot = snapshot;
          },
          sessionId: "session-1",
        }),
      );
      await flushMicrotasks();
    });

    expect(MockEventSource.instances[0]?.url).toBe("/api/session/session-1/events");
    expect(fetchMock).toHaveBeenCalledWith("/api/session-status");
  expect(getSnapshot().sessionStatus).toBe("busy");

    const eventSource = MockEventSource.instances[0];
    if (!eventSource?.onmessage) {
      throw new Error("EventSource handler was not registered.");
    }

    await act(async () => {
      eventSource.onmessage?.call(eventSource as unknown as EventSource, {
        data: JSON.stringify({
          properties: {
            sessionID: "session-1",
          },
          type: "session.idle",
        }),
      } as MessageEvent<string>);
      await flushMicrotasks();
    });

    expect(loadMessages).toHaveBeenCalledWith("session-1");
    expect(idleSpy).toHaveBeenCalledWith("session-1");
    expect(getSnapshot().sessionStatus).toBe("idle");
  });

  it("falls back to polling messages and statuses when the live stream drops during an active reply", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockResolvedValue(createStatusesResponse({ "session-1": "busy" }));
    const loadMessages = vi.fn().mockResolvedValue(undefined);
    let latestSnapshot: HookSnapshot | null = null;

    const getSnapshot = () => {
      if (!latestSnapshot) {
        throw new Error("Hook snapshot was not captured.");
      }

      return latestSnapshot;
    };

    vi.stubGlobal("fetch", fetchMock);

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          loadMessages,
          onSnapshot: (snapshot: HookSnapshot) => {
            latestSnapshot = snapshot;
          },
          sessionId: "session-1",
        }),
      );
      await flushMicrotasks();
    });

    const eventSource = MockEventSource.instances[0];
    if (!eventSource?.onerror) {
      throw new Error("EventSource error handler was not registered.");
    }

    await act(async () => {
      eventSource.onerror?.call(eventSource as unknown as EventSource, new Event("error"));
    });

    expect(getSnapshot().isLiveUnavailable).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(2500);
      await flushMicrotasks();
    });

    expect(loadMessages).toHaveBeenCalledWith("session-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getSnapshot().sessionStatus).toBe("busy");
  });
});