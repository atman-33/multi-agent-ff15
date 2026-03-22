import { afterEach, describe, expect, it, vi } from "vitest";

import { withTimeout } from "./task-timeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("returns the original result when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("rejects when the promise does not settle before the deadline", async () => {
    vi.useFakeTimers();

    const pending = new Promise<string>(() => undefined);
    const result = withTimeout(pending, 25);
    const expectation = expect(result).rejects.toThrow("Timed out after 25ms");

    await vi.advanceTimersByTimeAsync(25);

    await expectation;
  });
});