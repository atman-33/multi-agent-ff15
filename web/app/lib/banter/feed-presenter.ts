import type { BanterTimelineEntry } from "@/lib/types/mission";
import type { BanterEntry } from "@/routes/_layout.noctis-team/components/banter-log";

import { createBanterRevealQueue } from "./reveal-queue";
import { createLiteralBanterTemplate } from "./runtime";
import type { RecentBanterEntry } from "./types";

export interface BanterFeedState {
  entries: BanterEntry[];
  latestBanterEntryId: string | null;
  speakingAgentId: string | null;
}

export interface BanterFeedPresenter {
  applyTimelineSnapshot: (timeline: BanterTimelineEntry[]) => void;
  enqueueLiveEntries: (entries: BanterTimelineEntry[]) => void;
  clear: () => void;
  dispose: () => void;
  getState: () => BanterFeedState;
}

export interface BanterFeedPresenterOptions {
  initialRevealDelayMs?: number;
  computeRevealDelay?: (remainingQueueLength: number) => number;
  speakingIndicatorMs?: number;
  onChange?: (state: BanterFeedState) => void;
}

function createEmptyState(): BanterFeedState {
  return {
    entries: [],
    latestBanterEntryId: null,
    speakingAgentId: null,
  };
}

function toVisibleBanterEntry(entry: BanterTimelineEntry): BanterEntry | null {
  const template = createLiteralBanterTemplate(entry.speakerAgent, entry.renderedMessage);
  if (!template) {
    return null;
  }

  const timestamp = new Date(entry.createdAt);
  return {
    ...template,
    id: entry.id,
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
  };
}

function hasMatchingRenderedBanter(
  existingEntries: RecentBanterEntry[],
  entry: Pick<BanterTimelineEntry, "speakerAgent" | "renderedMessage">,
): boolean {
  return existingEntries.some(
    (existing) =>
      existing.speakerId === entry.speakerAgent && existing.message === entry.renderedMessage,
  );
}

function compareTimelineEntries(left: BanterTimelineEntry, right: BanterTimelineEntry): number {
  const byTimestamp = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  if (byTimestamp !== 0) {
    return byTimestamp;
  }

  return left.id.localeCompare(right.id);
}

function toRecentEntries(entries: BanterEntry[]): RecentBanterEntry[] {
  return entries.map((entry) => ({
    speakerId: entry.speakerId,
    message: entry.message,
  }));
}

export function createBanterFeedPresenter(
  options: BanterFeedPresenterOptions = {},
): BanterFeedPresenter {
  const speakingIndicatorMs = options.speakingIndicatorMs ?? 980;

  let state = createEmptyState();
  let hasHydrated = false;
  let recentEntries: RecentBanterEntry[] = [];
  let seenEntryIds = new Set<string>();
  let speakingResetTimer: ReturnType<typeof setTimeout> | null = null;

  const emit = () => {
    options.onChange?.({
      entries: [...state.entries],
      latestBanterEntryId: state.latestBanterEntryId,
      speakingAgentId: state.speakingAgentId,
    });
  };

  const clearSpeakingResetTimer = () => {
    if (!speakingResetTimer) {
      return;
    }

    clearTimeout(speakingResetTimer);
    speakingResetTimer = null;
  };

  const revealQueue = createBanterRevealQueue<BanterTimelineEntry>({
    onReveal: (entry) => {
      const nextEntry = toVisibleBanterEntry(entry);
      if (!nextEntry) {
        return;
      }

      if (state.entries.some((current) => current.id === nextEntry.id)) {
        return;
      }

      const nextEntries = [...state.entries, nextEntry];
      recentEntries = toRecentEntries(nextEntries);
      state = {
        entries: nextEntries,
        latestBanterEntryId: nextEntry.id,
        speakingAgentId: nextEntry.speakerId,
      };
      emit();

      clearSpeakingResetTimer();
      speakingResetTimer = setTimeout(() => {
        state = {
          ...state,
          speakingAgentId: state.speakingAgentId === nextEntry.speakerId ? null : state.speakingAgentId,
        };
        speakingResetTimer = null;
        emit();
      }, speakingIndicatorMs);
    },
    initialDelayMs: options.initialRevealDelayMs,
    computeDelay: options.computeRevealDelay,
  });

  const applyHydratedSnapshot = (timeline: BanterTimelineEntry[]) => {
    const orderedEntries = [...timeline].sort(compareTimelineEntries);
    const nextEntries: BanterEntry[] = [];
    const nextRecentEntries: RecentBanterEntry[] = [];
    const nextSeenIds = new Set<string>();

    for (const entry of orderedEntries) {
      nextSeenIds.add(entry.id);
      if (hasMatchingRenderedBanter(nextRecentEntries, entry)) {
        continue;
      }

      const visibleEntry = toVisibleBanterEntry(entry);
      if (!visibleEntry) {
        continue;
      }

      nextEntries.push(visibleEntry);
      nextRecentEntries.push({
        speakerId: visibleEntry.speakerId,
        message: visibleEntry.message,
      });
    }

    clearSpeakingResetTimer();
    seenEntryIds = nextSeenIds;
    recentEntries = nextRecentEntries;
    hasHydrated = true;
    state = {
      entries: nextEntries,
      latestBanterEntryId: null,
      speakingAgentId: null,
    };
    emit();
  };

  const enqueueLiveEntries = (entries: BanterTimelineEntry[]) => {
    const nextEntries = [...entries]
      .sort(compareTimelineEntries)
      .filter((entry) => !seenEntryIds.has(entry.id))
      .filter((entry) => !hasMatchingRenderedBanter(recentEntries, entry));

    if (nextEntries.length === 0) {
      return;
    }

    for (const entry of nextEntries) {
      seenEntryIds.add(entry.id);
    }
    revealQueue.enqueue(nextEntries);
  };

  const clear = () => {
    revealQueue.clear();
    clearSpeakingResetTimer();
    hasHydrated = false;
    recentEntries = [];
    seenEntryIds = new Set();
    state = createEmptyState();
    emit();
  };

  return {
    applyTimelineSnapshot(timeline) {
      if (!hasHydrated) {
        applyHydratedSnapshot(timeline);
        return;
      }

      enqueueLiveEntries(timeline);
    },
    enqueueLiveEntries,
    clear,
    dispose: clear,
    getState() {
      return {
        entries: [...state.entries],
        latestBanterEntryId: state.latestBanterEntryId,
        speakingAgentId: state.speakingAgentId,
      };
    },
  };
}