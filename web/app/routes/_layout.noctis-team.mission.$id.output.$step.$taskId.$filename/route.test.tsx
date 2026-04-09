import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { navigateMock, sheetSpy } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  sheetSpy: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/components/markdown-document-sheet-preview", () => ({
  MarkdownDocumentSheetPreview: ({ title }: { title: string }) => <section>{title}</section>,
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, onOpenChange, open }: { children: ReactNode; onOpenChange?: (open: boolean) => void; open?: boolean }) => {
    sheetSpy({ onOpenChange, open });
    return <div>{children}</div>;
  },
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetClose: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

import { NoctisTeamMissionOutputDetailRoute } from "./route";

describe("noctis-team mission output detail route", () => {
  it("navigates back to the parent mission route when the preview closes", () => {
    renderToStaticMarkup(
      createElement(NoctisTeamMissionOutputDetailRoute, {
        loaderData: {
          author: "Noctis",
          content: "# Plan\n",
          date: "2026-04-09T00:00:00.000Z",
          displayMode: "markdown",
          error: null,
          filePath: "/tmp/news-run-plan.md",
          filename: "news-run-plan.md",
          frontmatter: null,
          missionId: "mission-123",
          rawContent: "# Plan\n",
          step: "prepare-run",
          tags: [],
          taskId: "step_prepare-run_1",
          title: "News run plan",
        },
      } as never),
    );

    const props = sheetSpy.mock.calls[0]?.[0] as { onOpenChange?: (open: boolean) => void } | undefined;
    props?.onOpenChange?.(false);

    expect(navigateMock).toHaveBeenCalledWith("/noctis-team/mission/mission-123");
  });
});