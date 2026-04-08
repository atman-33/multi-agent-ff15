import { describe, expect, it } from "vitest";
import { shouldAutoFollowThreadUpdate } from "./chat-thread-scroll-policy";

describe("chat-thread-scroll-policy", () => {
  it("does not auto-follow semantic no-op refreshes", () => {
    expect(
      shouldAutoFollowThreadUpdate({
        nearBottom: true,
        scrollSignal: "none",
      }),
    ).toBe(false);
  });

  it("auto-follows tail append when already near the bottom", () => {
    expect(
      shouldAutoFollowThreadUpdate({
        nearBottom: true,
        scrollSignal: "tail-append",
      }),
    ).toBe(true);
  });

  it("does not auto-follow new activity while user is away from the bottom", () => {
    expect(
      shouldAutoFollowThreadUpdate({
        nearBottom: false,
        scrollSignal: "streaming-growth",
      }),
    ).toBe(false);
  });
});