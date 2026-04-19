// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSheetTransition } from "./use-sheet-transition";

type HookSnapshot = {
  handleContentAnimationEnd: (event: {
    currentTarget: { getAttribute: (name: string) => string | null };
    target: unknown;
  }) => void;
  handleOpenChange: (open: boolean) => void;
  isSheetOpen: boolean;
  isVisualRouteActive: boolean;
  reopen: () => void;
};

function HookProbe({
  activeKey,
  onCloseComplete,
  onSnapshot,
}: {
  activeKey: string | null;
  onCloseComplete: () => void;
  onSnapshot: (snapshot: HookSnapshot) => void;
}) {
  const transition = useSheetTransition({
    activeKey,
    closeDurationMs: 300,
    onCloseComplete,
  });

  onSnapshot(transition);

  return null;
}

describe("use-sheet-transition", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container.remove();
    vi.useRealTimers();
  });

  it("hides visual detail state immediately while delaying close completion until the animation ends", async () => {
    vi.useFakeTimers();

    const closeCompleteSpy = vi.fn();
    let latestSnapshot: HookSnapshot | null = null;
    const getSnapshot = (): HookSnapshot => {
      if (!latestSnapshot) {
        throw new Error("Hook snapshot was not captured.");
      }

      return latestSnapshot;
    };

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeKey: "mission-output:step-1:task-1:file.md",
          onCloseComplete: closeCompleteSpy,
          onSnapshot: (snapshot: HookSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    expect(getSnapshot().isSheetOpen).toBe(true);
    expect(getSnapshot().isVisualRouteActive).toBe(true);

    act(() => {
      getSnapshot().handleOpenChange(false);
    });

    expect(getSnapshot().isSheetOpen).toBe(false);
    expect(getSnapshot().isVisualRouteActive).toBe(false);
    expect(closeCompleteSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(299);
    });

    expect(closeCompleteSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(closeCompleteSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores spurious open requests while a close transition is in progress", async () => {
    vi.useFakeTimers();

    const closeCompleteSpy = vi.fn();
    let latestSnapshot: HookSnapshot | null = null;
    const getSnapshot = (): HookSnapshot => {
      if (!latestSnapshot) {
        throw new Error("Hook snapshot was not captured.");
      }

      return latestSnapshot;
    };

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeKey: "mission-output:step-1:task-1:file.md",
          onCloseComplete: closeCompleteSpy,
          onSnapshot: (snapshot: HookSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    act(() => {
      getSnapshot().handleOpenChange(false);
    });

    expect(getSnapshot().isSheetOpen).toBe(false);

    act(() => {
      getSnapshot().handleOpenChange(true);
    });

    expect(getSnapshot().isSheetOpen).toBe(false);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(closeCompleteSpy).toHaveBeenCalledTimes(1);
  });

  it("completes close immediately when the sheet closed animation ends", async () => {
    vi.useFakeTimers();

    const closeCompleteSpy = vi.fn();
    let latestSnapshot: HookSnapshot | null = null;
    const getSnapshot = (): HookSnapshot => {
      if (!latestSnapshot) {
        throw new Error("Hook snapshot was not captured.");
      }

      return latestSnapshot;
    };

    root = createRoot(container);
    await act(async () => {
      root?.render(
        createElement(HookProbe, {
          activeKey: "mission-output:step-1:task-1:file.md",
          onCloseComplete: closeCompleteSpy,
          onSnapshot: (snapshot: HookSnapshot) => {
            latestSnapshot = snapshot;
          },
        }),
      );
    });

    act(() => {
      getSnapshot().handleOpenChange(false);
    });

    const target = {
      getAttribute: (name: string) => (name === "data-state" ? "closed" : null),
    };

    act(() => {
      getSnapshot().handleContentAnimationEnd({
        currentTarget: target,
        target,
      });
    });

    expect(closeCompleteSpy).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(closeCompleteSpy).toHaveBeenCalledTimes(1);
  });
});
