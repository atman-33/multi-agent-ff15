import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MissionActivityLogEntry } from "@/lib/types/mission";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { MissionActivityLog } from "./mission-activity-log";

const baseEntry: MissionActivityLogEntry = {
  id: "activity-1",
  missionId: "mission-1",
  actor: "system",
  speaker: "system",
  kind: "system_event",
  body: "Updated Lunafreya prompt context.",
  createdAt: "2026-04-12T15:07:00.000Z",
};

describe("mission-activity-log", () => {
  it("renders activity entries in chronological order with the newest item last", () => {
    const markup = renderToStaticMarkup(
      <MissionActivityLog
        entries={[
          {
            ...baseEntry,
            id: "activity-older",
            body: "Older entry",
            createdAt: "2026-04-12T15:06:00.000Z",
          },
          {
            ...baseEntry,
            id: "activity-newer",
            body: "Newer entry",
            createdAt: "2026-04-12T15:07:00.000Z",
          },
        ]}
      />,
    );

    expect(markup.indexOf("Older entry")).toBeLessThan(markup.indexOf("Newer entry"));
  });

  it("hides duplicate Lunafreya job and knowledge lines when overlay badges are shown", () => {
    const markup = renderToStaticMarkup(
      <MissionActivityLog
        entries={[
          {
            ...baseEntry,
            body: [
              "Updated Lunafreya prompt context.",
              "Job: Shiritori lead",
              "Knowledge: agent-relationships",
            ].join("\n"),
            source: {
              type: "system",
              lunafreyaFacetSnapshot: {
                selectedJobId: "shiritori-lead",
                selectedJobLabel: "Shiritori lead",
                selectedKnowledgeIds: ["agent-relationships"],
                selectedKnowledgeLabels: ["agent-relationships"],
                updatedAt: "2026-04-12T15:07:00.000Z",
              },
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Updated Lunafreya prompt context.");
    expect(markup).toContain("Applied context");
    expect(markup).not.toContain("Knowledge: agent-relationships");
    expect(markup).toContain("Job: Shiritori lead");
    expect(markup).toContain("agent-relationships");
  });

  it("preserves the original body when no Lunafreya overlay snapshot exists", () => {
    const markup = renderToStaticMarkup(
      <MissionActivityLog
        entries={[
          {
            ...baseEntry,
            body: "Updated mission context projects.\nKnowledge: keep this line",
          },
        ]}
      />,
    );

    expect(markup).toContain("Updated mission context projects.");
    expect(markup).toContain("Knowledge: keep this line");
    expect(markup).not.toContain("Applied context");
  });

  it("shows the default Lunafreya Job label when the snapshot has no explicit job override", () => {
    const markup = renderToStaticMarkup(
      <MissionActivityLog
        entries={[
          {
            ...baseEntry,
            body: "Updated Lunafreya prompt context.",
            source: {
              type: "system",
              lunafreyaFacetSnapshot: {
                selectedKnowledgeIds: [],
                selectedKnowledgeLabels: [],
                updatedAt: "2026-04-12T15:07:00.000Z",
              },
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Applied context");
    expect(markup).toContain("Job: Default (Lunafreya Autonomous)");
  });
});