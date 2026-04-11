import type {
  AmbientBanterEntry,
  BanterTimelineEntry,
  ConversationLogEntry,
  Mission,
} from "@/lib/types/mission";

function compareBanterTimelineEntries(left: BanterTimelineEntry, right: BanterTimelineEntry): number {
  const byTime = left.createdAt.localeCompare(right.createdAt);
  if (byTime !== 0) {
    return byTime;
  }

  const leftKindRank = left.kind === "directed" ? 0 : 1;
  const rightKindRank = right.kind === "directed" ? 0 : 1;
  if (leftKindRank !== rightKindRank) {
    return leftKindRank - rightKindRank;
  }

  return left.id.localeCompare(right.id);
}

export function buildBanterTimeline(input: {
  conversationLog: ConversationLogEntry[];
  ambientBanterLog: AmbientBanterEntry[];
}): BanterTimelineEntry[] {
  return [...input.conversationLog, ...input.ambientBanterLog].sort(compareBanterTimelineEntries);
}

export function buildMissionBanterTimeline(
  mission: Pick<Mission, "conversationLog" | "ambientBanterLog">,
): BanterTimelineEntry[] {
  return buildBanterTimeline({
    conversationLog: mission.conversationLog,
    ambientBanterLog: mission.ambientBanterLog,
  });
}