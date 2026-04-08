import { describe, expect, it } from "vitest";
import {
  createMessageInspectabilityState,
  getExpandedDetailEntryIds,
  isConversationUnitExpanded,
  reconcileMessageInspectabilityState,
  toggleConversationUnitExpansion,
  toggleDetailEntryExpansion,
} from "./message-inspectability-state";

describe("message-inspectability-state", () => {
  it("toggles conversation units and detail entries by stable ids", () => {
    const initial = createMessageInspectabilityState();
    const expandedMessage = toggleConversationUnitExpansion(initial, "conv-1");
    const expandedDetail = toggleDetailEntryExpansion(expandedMessage, "conv-1", "tool:tool-1:0");

    expect(isConversationUnitExpanded(expandedDetail, "conv-1")).toBe(true);
    expect(getExpandedDetailEntryIds(expandedDetail, "conv-1")).toEqual(["tool:tool-1:0"]);
  });

  it("keeps unchanged inspectability state while pruning stale message and detail ids", () => {
    const initial = createMessageInspectabilityState();
    const withCurrentMessage = toggleConversationUnitExpansion(initial, "conv-1");
    const withCurrentDetails = toggleDetailEntryExpansion(
      toggleDetailEntryExpansion(withCurrentMessage, "conv-1", "tool:tool-1:0"),
      "conv-1",
      "prompt:reply-1:instruction:0",
    );
    const withStaleMessage = toggleConversationUnitExpansion(withCurrentDetails, "conv-stale");
    const expanded = toggleDetailEntryExpansion(withStaleMessage, "conv-stale", "tool:old:0");

    const reconciled = reconcileMessageInspectabilityState(expanded, [
      {
        conversationUnitId: "conv-1",
        detailEntryIds: ["tool:tool-1:0"],
      },
    ]);

    expect(isConversationUnitExpanded(reconciled, "conv-1")).toBe(true);
    expect(getExpandedDetailEntryIds(reconciled, "conv-1")).toEqual(["tool:tool-1:0"]);
    expect(isConversationUnitExpanded(reconciled, "conv-stale")).toBe(false);
    expect(getExpandedDetailEntryIds(reconciled, "conv-stale")).toEqual([]);
  });
});