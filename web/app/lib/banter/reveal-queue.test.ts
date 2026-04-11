import { afterEach, describe, expect, it, vi } from "vitest";

import { createBanterRevealQueue } from "./reveal-queue";

afterEach(() => {
  vi.useRealTimers();
});

describe("createBanterRevealQueue", () => {
  it("reveals enqueued entries one at a time in order", async () => {
    vi.useFakeTimers();

    const revealed: string[] = [];
    const queue = createBanterRevealQueue<string>({
      onReveal: (entry) => {
        revealed.push(entry);
      },
      initialDelayMs: 40,
      computeDelay: () => 25,
    });

    queue.enqueue(["first", "second"]);

    expect(revealed).toEqual([]);

    await vi.advanceTimersByTimeAsync(40);
    expect(revealed).toEqual(["first"]);

    await vi.advanceTimersByTimeAsync(24);
    expect(revealed).toEqual(["first"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(revealed).toEqual(["first", "second"]);
  });

  it("cancels pending reveals when cleared", async () => {
    vi.useFakeTimers();

    const revealed: string[] = [];
    const queue = createBanterRevealQueue<string>({
      onReveal: (entry) => {
        revealed.push(entry);
      },
      initialDelayMs: 40,
      computeDelay: () => 25,
    });

    queue.enqueue(["first", "second"]);
    queue.clear();

    await vi.advanceTimersByTimeAsync(100);

    expect(revealed).toEqual([]);
  });

  it("keeps later enqueued entries behind the current reveal order", async () => {
    vi.useFakeTimers();

    const revealed: string[] = [];
    const queue = createBanterRevealQueue<string>({
      onReveal: (entry) => {
        revealed.push(entry);
      },
      initialDelayMs: 40,
      computeDelay: () => 25,
    });

    queue.enqueue(["first", "second"]);

    await vi.advanceTimersByTimeAsync(40);
    expect(revealed).toEqual(["first"]);

    queue.enqueue(["third"]);

    await vi.advanceTimersByTimeAsync(25);
    expect(revealed).toEqual(["first", "second"]);

    await vi.advanceTimersByTimeAsync(25);
    expect(revealed).toEqual(["first", "second", "third"]);
  });
});