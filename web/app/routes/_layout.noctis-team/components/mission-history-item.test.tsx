import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MissionSummary } from "@/lib/types/mission";
import { MissionHistoryItem } from "./mission-history-item";

vi.mock("react-router", () => ({
  NavLink: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));

function createMissionSummary(overrides: Partial<MissionSummary> = {}): MissionSummary {
  return {
    missionId: "mission-1",
    title: "Mission One",
    createdAt: "2026-04-13T00:00:00.000Z",
    updatedAt: "2026-04-13T00:00:00.000Z",
    status: "active",
    activitySessionIds: ["session-1"],
    ...overrides,
  };
}

describe("MissionHistoryItem", () => {
  it("shows the running spinner for a running Noctis Team mission row", () => {
    const markup = renderToStaticMarkup(
      <MissionHistoryItem
        mission={createMissionSummary()}
        routeBase="/noctis-team"
        isActive={false}
        isArchivedView={false}
        isEditing={false}
        isArchivePending={false}
        isArchiveDisabled={false}
        isRenaming={false}
        isRunning={true}
        onBeginRename={vi.fn()}
        onArchiveAction={vi.fn()}
        onCancelRename={vi.fn()}
        onSubmitRename={vi.fn()}
      />,
    );

    expect(markup).toContain("animate-spin");
    expect(markup).toContain("/noctis-team/mission/mission-1");
  });

  it("keeps the shared running indicator behavior for Lunafreya mission rows", () => {
    const markup = renderToStaticMarkup(
      <MissionHistoryItem
        mission={createMissionSummary({ missionId: "mission-luna" })}
        routeBase="/lunafreya"
        isActive={false}
        isArchivedView={false}
        isEditing={false}
        isArchivePending={false}
        isArchiveDisabled={false}
        isRenaming={false}
        isRunning={true}
        onBeginRename={vi.fn()}
        onArchiveAction={vi.fn()}
        onCancelRename={vi.fn()}
        onSubmitRename={vi.fn()}
      />,
    );

    expect(markup).toContain("animate-spin");
    expect(markup).toContain("/lunafreya/mission/mission-luna");
  });
});