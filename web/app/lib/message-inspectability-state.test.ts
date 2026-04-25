import { describe, expect, it } from "vitest";
import { buildSessionChatRenderSnapshot } from "./session-chat-rendering-orchestration";
import {
  createMessageInspectabilityState,
  getExpandedDetailEntryIds,
  isConversationUnitExpanded,
  reconcileMessageInspectabilityState,
  toggleConversationUnitExpansion,
  toggleDetailEntryExpansion,
} from "./message-inspectability-state";
import { toSessionPresentationMessages } from "./session-message-presentation";

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

  it("preserves unrelated detail entry records when another conversation unit toggles", () => {
    const initial = createMessageInspectabilityState();
    const withFirstConversation = toggleDetailEntryExpansion(initial, "conv-1", "tool:conv-1:0");
    const withTwoConversations = toggleDetailEntryExpansion(
      withFirstConversation,
      "conv-2",
      "tool:conv-2:0",
    );

    const firstConversationEntries = withTwoConversations.expandedDetailEntries["conv-1"];
    const toggledSecondConversation = toggleDetailEntryExpansion(
      withTwoConversations,
      "conv-2",
      "tool:conv-2:1",
    );

    expect(toggledSecondConversation.expandedDetailEntries["conv-1"]).toBe(
      firstConversationEntries,
    );
    expect(getExpandedDetailEntryIds(toggledSecondConversation, "conv-2")).toEqual([
      "tool:conv-2:0",
      "tool:conv-2:1",
    ]);
  });

  it("preserves inspectability state across noop polling rehydration", () => {
    const initialSnapshot = buildSessionChatRenderSnapshot({
      messages: toSessionPresentationMessages([
        {
          info: {
            id: "assistant-1",
            role: "assistant",
            agent: "noctis",
            time: { created: Date.parse("2026-04-08T10:00:00.000Z") },
          },
          parts: [{ type: "tool", tool: "bash", state: { status: "completed" } }],
        },
        {
          info: {
            id: "assistant-2",
            role: "assistant",
            agent: "ignis",
            time: { created: Date.parse("2026-04-08T10:00:05.000Z") },
          },
          parts: [{ type: "tool", tool: "read_file", state: { status: "completed" } }],
        },
      ]),
    });
    const [firstBoundary, secondBoundary] = initialSnapshot.inspectabilityBoundaries;
    const firstDetailEntryId = firstBoundary.detailEntryIds[0];

    expect(firstDetailEntryId).toBeDefined();
    if (!firstDetailEntryId) {
      throw new Error("Expected at least one detail entry for the first conversation unit");
    }

    let state = createMessageInspectabilityState();
    state = toggleConversationUnitExpansion(state, firstBoundary.conversationUnitId);
    state = toggleDetailEntryExpansion(
      state,
      firstBoundary.conversationUnitId,
      firstDetailEntryId,
    );
    state = toggleConversationUnitExpansion(state, secondBoundary.conversationUnitId);

    const firstConversationEntries =
      state.expandedDetailEntries[firstBoundary.conversationUnitId];
    const rehydratedSnapshot = buildSessionChatRenderSnapshot({
      messages: toSessionPresentationMessages([
        {
          info: {
            id: "assistant-1",
            role: "assistant",
            agent: "noctis",
            time: { created: Date.parse("2026-04-08T10:00:00.000Z") },
          },
          parts: [{ type: "tool", tool: "bash", state: { status: "completed" } }],
        },
        {
          info: {
            id: "assistant-2",
            role: "assistant",
            agent: "ignis",
            time: { created: Date.parse("2026-04-08T10:00:05.000Z") },
          },
          parts: [{ type: "tool", tool: "read_file", state: { status: "completed" } }],
        },
      ]),
      previousSnapshot: initialSnapshot,
    });

    const reconciled = reconcileMessageInspectabilityState(
      state,
      rehydratedSnapshot.inspectabilityBoundaries,
    );

    expect(rehydratedSnapshot.refreshKind).toBe("noop");
    expect(reconciled).toBe(state);
    expect(reconciled.expandedDetailEntries[firstBoundary.conversationUnitId]).toBe(
      firstConversationEntries,
    );
  });

  it("preserves inspectability state when authoritative history settles over a live draft using the same ids", () => {
    let state = createMessageInspectabilityState();
    state = toggleConversationUnitExpansion(state, "assistant-1");
    state = toggleDetailEntryExpansion(state, "assistant-1", "tool:assistant-1:0");

    const settledSnapshot = buildSessionChatRenderSnapshot({
      messages: toSessionPresentationMessages([
        {
          info: {
            id: "assistant-1",
            role: "assistant",
            agent: "iris",
            time: { created: Date.parse("2026-04-25T10:00:00.000Z") },
          },
          parts: [
            { type: "tool", tool: "read_file", state: { status: "completed" } },
            { type: "text", text: "Done." },
          ],
        },
      ]),
    });

    const reconciled = reconcileMessageInspectabilityState(
      state,
      settledSnapshot.inspectabilityBoundaries,
    );

    expect(isConversationUnitExpanded(reconciled, "assistant-1")).toBe(true);
    expect(getExpandedDetailEntryIds(reconciled, "assistant-1")).toEqual([
      "tool:assistant-1:0",
    ]);
    expect(reconciled).toBe(state);
  });
});