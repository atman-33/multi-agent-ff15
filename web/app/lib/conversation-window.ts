export type ConversationWindow = {
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
};

export function calculateConversationWindow({
  itemHeights,
  overscan,
  scrollTop,
  viewportHeight,
}: {
  itemHeights: number[];
  overscan: number;
  scrollTop: number;
  viewportHeight: number;
}): ConversationWindow {
  const itemCount = itemHeights.length;
  if (itemCount === 0 || viewportHeight <= 0) {
    return {
      startIndex: 0,
      endIndex: itemCount,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    };
  }

  let visibleStartIndex = 0;
  let consumedHeight = 0;

  while (
    visibleStartIndex < itemCount &&
    consumedHeight + itemHeights[visibleStartIndex]! <= scrollTop
  ) {
    consumedHeight += itemHeights[visibleStartIndex]!;
    visibleStartIndex += 1;
  }

  let visibleEndIndex = visibleStartIndex;
  let visibleHeight = 0;

  while (visibleEndIndex < itemCount && visibleHeight < viewportHeight) {
    visibleHeight += itemHeights[visibleEndIndex]!;
    visibleEndIndex += 1;
  }

  const startIndex = Math.max(0, visibleStartIndex - overscan);
  const endIndex = Math.min(itemCount, visibleEndIndex + overscan);
  const topSpacerHeight = itemHeights
    .slice(0, startIndex)
    .reduce((sum, height) => sum + height, 0);
  const bottomSpacerHeight = itemHeights
    .slice(endIndex)
    .reduce((sum, height) => sum + height, 0);

  return {
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
  };
}