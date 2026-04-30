import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { readTmuxMonitorSnapshotMock } = vi.hoisted(() => ({
  readTmuxMonitorSnapshotMock: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useRevalidator: () => ({
      revalidate: vi.fn(),
      state: "idle",
    }),
  };
});

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("./components/tmux-monitor-pane", () => ({
  TmuxMonitorPaneCard: ({ pane }: { pane: { agentId: string; content: string } }) => (
    <div>
      {pane.agentId}
      {pane.content}
    </div>
  ),
}));

vi.mock("@/lib/tmux-monitor.server", () => ({
  readTmuxMonitorSnapshot: readTmuxMonitorSnapshotMock,
}));

import { loader, TmuxMonitorPage } from "./route";

const TestPage = TmuxMonitorPage as unknown as (props: { loaderData: unknown }) => ReactNode;

describe("tmux monitor route", () => {
  it("loads the monitor snapshot from the server helper", async () => {
    readTmuxMonitorSnapshotMock.mockResolvedValue({
      agentStatuses: {
        noctis: "busy",
      },
      bootstrapStatus: null,
      panes: [],
      transportMode: "tmux-resident",
    });

    await expect(loader({} as never)).resolves.toEqual({
      agentStatuses: {
        noctis: "busy",
      },
      bootstrapStatus: null,
      panes: [],
      transportMode: "tmux-resident",
    });
    expect(readTmuxMonitorSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it("renders the tmux transport summary and pane roster", () => {
    const markup = renderToStaticMarkup(
      <TestPage
        loaderData={{
          agentStatuses: {
            gladiolus: "idle",
            ignis: "idle",
            iris: "idle",
            lunafreya: "idle",
            noctis: "busy",
            prompto: "idle",
          },
          bootstrapStatus: {
            agentCount: 6,
            dispatcherPid: 4321,
            error: null,
            isReady: true,
            lastStartedAt: "2026-05-01T00:00:00.000Z",
          },
          panes: [
            {
              agentId: "noctis",
              content: "Noctis pane output",
              paneIndex: 0,
              target: "ff15:main.0",
            },
            {
              agentId: "ignis",
              content: "Ignis pane output",
              paneIndex: 1,
              target: "ff15:main.1",
            },
            {
              agentId: "gladiolus",
              content: "Gladiolus pane output",
              paneIndex: 2,
              target: "ff15:main.2",
            },
            {
              agentId: "prompto",
              content: "Prompto pane output",
              paneIndex: 3,
              target: "ff15:main.3",
            },
            {
              agentId: "lunafreya",
              content: "Lunafreya pane output",
              paneIndex: 4,
              target: "ff15:main.4",
            },
            {
              agentId: "iris",
              content: "Iris pane output",
              paneIndex: 5,
              target: "ff15:main.5",
            },
          ],
          transportMode: "tmux-resident",
        } as never}
      />, 
    );

    expect(markup).toContain("Tmux Monitor");
    expect(markup).toContain("Transport Ready");
    expect(markup).toContain("Noctis pane output");
    expect(markup).toContain("Ignis pane output");
    expect(markup).toContain("lg:grid-cols-3");
    expect(markup).toContain("lg:grid-flow-col");
    expect(markup).toContain("lg:grid-rows-2");
    expect(markup).toContain("w-full");
  });
});