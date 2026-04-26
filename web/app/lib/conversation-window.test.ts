import { describe, expect, it } from "vitest";
import { calculateConversationWindow } from "./conversation-window";

describe("conversation-window", () => {
  it("returns the full range when the viewport height is unavailable", () => {
    expect(
      calculateConversationWindow({
        itemHeights: [100, 100, 100],
        overscan: 2,
        scrollTop: 50,
        viewportHeight: 0,
      }),
    ).toEqual({
      startIndex: 0,
      endIndex: 3,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    });
  });

  it("calculates a visible range with overscan and spacer heights", () => {
    expect(
      calculateConversationWindow({
        itemHeights: [100, 100, 100, 100, 100],
        overscan: 1,
        scrollTop: 250,
        viewportHeight: 150,
      }),
    ).toEqual({
      startIndex: 1,
      endIndex: 5,
      topSpacerHeight: 100,
      bottomSpacerHeight: 0,
    });
  });

  it("clamps the overscanned window at the tail of a long transcript", () => {
    expect(
      calculateConversationWindow({
        itemHeights: [100, 100, 100, 100, 100, 100, 100, 100],
        overscan: 2,
        scrollTop: 620,
        viewportHeight: 150,
      }),
    ).toEqual({
      startIndex: 4,
      endIndex: 8,
      topSpacerHeight: 400,
      bottomSpacerHeight: 0,
    });
  });
});