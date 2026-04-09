import { useCallback, useEffect, useState } from "react";
import {
  createMessageInspectabilityState,
  reconcileMessageInspectabilityState,
  toggleConversationUnitExpansion,
  toggleDetailEntryExpansion,
  type MessageInspectabilityBoundary,
} from "@/lib/message-inspectability-state";

const EMPTY_EXPANDED_DETAIL_ENTRIES: Record<string, true> = {};

export function useConversationUnitInspectability(
  boundaries: MessageInspectabilityBoundary[],
) {
  const [inspectabilityState, setInspectabilityState] = useState(
    createMessageInspectabilityState,
  );

  useEffect(() => {
    setInspectabilityState((current) =>
      reconcileMessageInspectabilityState(current, boundaries),
    );
  }, [boundaries]);

  const toggleConversationUnit = useCallback((conversationUnitId: string) => {
    setInspectabilityState((current) =>
      toggleConversationUnitExpansion(current, conversationUnitId),
    );
  }, []);

  const toggleDetailEntry = useCallback(
    (conversationUnitId: string, detailEntryId: string) => {
      setInspectabilityState((current) =>
        toggleDetailEntryExpansion(current, conversationUnitId, detailEntryId),
      );
    },
    [],
  );

  const isConversationUnitExpanded = useCallback(
    (conversationUnitId: string) =>
      Boolean(inspectabilityState.expandedConversationUnits[conversationUnitId]),
    [inspectabilityState.expandedConversationUnits],
  );

  const getExpandedDetailEntries = useCallback(
    (conversationUnitId: string) =>
      inspectabilityState.expandedDetailEntries[conversationUnitId] ??
      EMPTY_EXPANDED_DETAIL_ENTRIES,
    [inspectabilityState.expandedDetailEntries],
  );

  return {
    getExpandedDetailEntries,
    inspectabilityState,
    isConversationUnitExpanded,
    toggleConversationUnit,
    toggleDetailEntry,
  };
}