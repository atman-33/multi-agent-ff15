// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMissionSummaryPolling } from "./use-mission-summary-polling";

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function HookProbe({ onPoll }: { onPoll: () => void }) {
  useMissionSummaryPolling({
    enabled: true,
    onPoll,
  });

  useEffect(() => undefined, []);
  return null;
}

describe("useMissionSummaryPolling", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }

    container?.remove();
    vi.useRealTimers();
  });

  it("polls every 3 seconds while visible, pauses while hidden, and refreshes immediately on visibility restore", async () => {
    vi.useFakeTimers();

    let visibilityState: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });

    const onPoll = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(HookProbe, { onPoll }));
    });

    await flushEffects();
    expect(onPoll).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    expect(onPoll).toHaveBeenCalledTimes(2);

    visibilityState = "hidden";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(9000);
      await Promise.resolve();
    });
    expect(onPoll).toHaveBeenCalledTimes(2);

    visibilityState = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(onPoll).toHaveBeenCalledTimes(3);

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(onPoll).toHaveBeenCalledTimes(4);
  });
});