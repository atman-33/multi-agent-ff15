export type MessageInspectabilityBoundary = {
  conversationUnitId: string;
  detailEntryIds: string[];
};

export type MessageInspectabilityState = {
  expandedConversationUnits: Record<string, true>;
  expandedDetailEntries: Record<string, Record<string, true>>;
};

export function createMessageInspectabilityState(): MessageInspectabilityState {
  return {
    expandedConversationUnits: {},
    expandedDetailEntries: {},
  };
}

export function buildMessageInspectabilityBoundary(message: {
  conversationUnitId: string;
  parts: Array<{ type: string; detailId?: string }>;
  messageDisplay: {
    promptContextSections: Array<{ key: string; detailId?: string }>;
  };
}): MessageInspectabilityBoundary {
  const promptContextDetailIds = message.messageDisplay.promptContextSections.map(
    (section) => section.detailId ?? section.key,
  );
  let toolIndex = 0;
  const toolDetailIds = message.parts.flatMap((part) => {
    if (part.type !== "tool") {
      return [];
    }

    const fallbackId = `tool:${message.conversationUnitId}:${toolIndex}`;
    toolIndex += 1;
    return [part.detailId ?? fallbackId];
  });

  return {
    conversationUnitId: message.conversationUnitId,
    detailEntryIds: [...promptContextDetailIds, ...toolDetailIds],
  };
}

export function toggleConversationUnitExpansion(
  state: MessageInspectabilityState,
  conversationUnitId: string,
): MessageInspectabilityState {
  const isExpanded = Boolean(state.expandedConversationUnits[conversationUnitId]);
  const nextExpandedConversationUnits = { ...state.expandedConversationUnits };

  if (isExpanded) {
    delete nextExpandedConversationUnits[conversationUnitId];
  } else {
    nextExpandedConversationUnits[conversationUnitId] = true;
  }

  return {
    ...state,
    expandedConversationUnits: nextExpandedConversationUnits,
  };
}

export function toggleDetailEntryExpansion(
  state: MessageInspectabilityState,
  conversationUnitId: string,
  detailEntryId: string,
): MessageInspectabilityState {
  const currentEntries = state.expandedDetailEntries[conversationUnitId] ?? {};
  const nextEntries = { ...currentEntries };

  if (nextEntries[detailEntryId]) {
    delete nextEntries[detailEntryId];
  } else {
    nextEntries[detailEntryId] = true;
  }

  const nextExpandedDetailEntries = { ...state.expandedDetailEntries };
  if (Object.keys(nextEntries).length === 0) {
    delete nextExpandedDetailEntries[conversationUnitId];
  } else {
    nextExpandedDetailEntries[conversationUnitId] = nextEntries;
  }

  return {
    ...state,
    expandedDetailEntries: nextExpandedDetailEntries,
  };
}

export function isConversationUnitExpanded(
  state: MessageInspectabilityState,
  conversationUnitId: string,
): boolean {
  return Boolean(state.expandedConversationUnits[conversationUnitId]);
}

export function getExpandedDetailEntryIds(
  state: MessageInspectabilityState,
  conversationUnitId: string,
): string[] {
  return Object.keys(state.expandedDetailEntries[conversationUnitId] ?? {});
}

export function reconcileMessageInspectabilityState(
  state: MessageInspectabilityState,
  boundaries: MessageInspectabilityBoundary[],
): MessageInspectabilityState {
  const visibleConversationUnits = new Set(
    boundaries.map((boundary) => boundary.conversationUnitId),
  );
  const visibleDetailIdsByConversationUnit = new Map(
    boundaries.map((boundary) => [boundary.conversationUnitId, new Set(boundary.detailEntryIds)]),
  );

  let changed = false;
  const nextExpandedConversationUnits: Record<string, true> = {};
  for (const conversationUnitId of Object.keys(state.expandedConversationUnits)) {
    if (visibleConversationUnits.has(conversationUnitId)) {
      nextExpandedConversationUnits[conversationUnitId] = true;
    } else {
      changed = true;
    }
  }

  const nextExpandedDetailEntries: Record<string, Record<string, true>> = {};
  for (const [conversationUnitId, detailEntries] of Object.entries(
    state.expandedDetailEntries,
  )) {
    if (!visibleConversationUnits.has(conversationUnitId)) {
      changed = true;
      continue;
    }

    const visibleDetailIds = visibleDetailIdsByConversationUnit.get(conversationUnitId) ?? new Set();
    const nextDetailEntries: Record<string, true> = {};
    for (const detailEntryId of Object.keys(detailEntries)) {
      if (visibleDetailIds.has(detailEntryId)) {
        nextDetailEntries[detailEntryId] = true;
      } else {
        changed = true;
      }
    }

    if (Object.keys(nextDetailEntries).length > 0) {
      nextExpandedDetailEntries[conversationUnitId] = nextDetailEntries;
    }
  }

  if (!changed) {
    return state;
  }

  return {
    expandedConversationUnits: nextExpandedConversationUnits,
    expandedDetailEntries: nextExpandedDetailEntries,
  };
}