import { afterEach, describe, expect, it, vi } from "vitest";

import type { BanterTimelineEntry } from "@/lib/types/mission";

import { createBanterFeedPresenter } from "./feed-presenter";

function createAmbientEntry(input: {
  id: string;
  speakerAgent?: "noctis" | "ignis" | "gladiolus" | "prompto";
  renderedMessage: string;
  createdAt: string;
}): BanterTimelineEntry {
  return {
    id: input.id,
    missionId: "mission-1",
    kind: "ambient",
    speakerAgent: input.speakerAgent ?? "noctis",
    cue: "session-settled",
    renderedMessage: input.renderedMessage,
    createdAt: input.createdAt,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createBanterFeedPresenter", () => {
  it("hydrates the visible feed in persisted chronological order", () => {
    const presenter = createBanterFeedPresenter({
      initialRevealDelayMs: 40,
      computeRevealDelay: () => 25,
      speakingIndicatorMs: 80,
    });

    presenter.applyTimelineSnapshot([
      createAmbientEntry({
        id: "later",
        renderedMessage: "Second visible line",
        createdAt: "2026-04-11T10:00:05.000Z",
      }),
      createAmbientEntry({
        id: "earlier",
        renderedMessage: "First visible line",
        createdAt: "2026-04-11T10:00:00.000Z",
      }),
    ]);

    expect(presenter.getState()).toMatchObject({
      latestBanterEntryId: null,
      speakingAgentId: null,
    });
    expect(presenter.getState().entries.map((entry) => entry.id)).toEqual(["earlier", "later"]);
  });

  it("appends late-arriving live entries in reveal order without re-sorting visible history", async () => {
    vi.useFakeTimers();

    const presenter = createBanterFeedPresenter({
      initialRevealDelayMs: 40,
      computeRevealDelay: () => 25,
      speakingIndicatorMs: 80,
    });

    presenter.applyTimelineSnapshot([
      createAmbientEntry({
        id: "report-1",
        speakerAgent: "prompto",
        renderedMessage: "Report delivered.",
        createdAt: "2026-04-11T10:00:01.000Z",
      }),
      createAmbientEntry({
        id: "report-2",
        speakerAgent: "noctis",
        renderedMessage: "Acknowledged.",
        createdAt: "2026-04-11T10:00:02.000Z",
      }),
    ]);

    presenter.applyTimelineSnapshot([
      createAmbientEntry({
        id: "report-1",
        speakerAgent: "prompto",
        renderedMessage: "Report delivered.",
        createdAt: "2026-04-11T10:00:01.000Z",
      }),
      createAmbientEntry({
        id: "report-2",
        speakerAgent: "noctis",
        renderedMessage: "Acknowledged.",
        createdAt: "2026-04-11T10:00:02.000Z",
      }),
      createAmbientEntry({
        id: "settled",
        speakerAgent: "noctis",
        renderedMessage: "Settled.",
        createdAt: "2026-04-11T09:59:59.000Z",
      }),
    ]);

    expect(presenter.getState().entries.map((entry) => entry.id)).toEqual(["report-1", "report-2"]);

    await vi.advanceTimersByTimeAsync(40);

    expect(presenter.getState()).toMatchObject({
      latestBanterEntryId: "settled",
      speakingAgentId: "noctis",
    });
    expect(presenter.getState().entries.map((entry) => entry.id)).toEqual([
      "report-1",
      "report-2",
      "settled",
    ]);
  });

  it("clears mission state so the next snapshot rehydrates from persisted chronology", () => {
    const presenter = createBanterFeedPresenter({
      initialRevealDelayMs: 40,
      computeRevealDelay: () => 25,
      speakingIndicatorMs: 80,
    });

    presenter.applyTimelineSnapshot([
      createAmbientEntry({
        id: "live-tail",
        renderedMessage: "Visible tail from prior session",
        createdAt: "2026-04-11T10:00:03.000Z",
      }),
    ]);
    presenter.clear();

    presenter.applyTimelineSnapshot([
      createAmbientEntry({
        id: "snapshot-earlier",
        renderedMessage: "Chronology first",
        createdAt: "2026-04-11T10:00:00.000Z",
      }),
      createAmbientEntry({
        id: "snapshot-later",
        renderedMessage: "Chronology second",
        createdAt: "2026-04-11T10:00:04.000Z",
      }),
    ]);

    expect(presenter.getState()).toMatchObject({
      latestBanterEntryId: null,
      speakingAgentId: null,
    });
    expect(presenter.getState().entries.map((entry) => entry.id)).toEqual([
      "snapshot-earlier",
      "snapshot-later",
    ]);
  });
});