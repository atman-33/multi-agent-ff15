// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { matchMock, navigateMock, paramsMock, sheetSpy } = vi.hoisted(() => ({
  matchMock: vi.fn(),
  navigateMock: vi.fn(),
  paramsMock: vi.fn(),
  sheetSpy: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Outlet: () => <div>nested-route</div>,
    useMatch: () => matchMock(),
    useNavigate: () => navigateMock,
    useParams: () => paramsMock(),
  };
});

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, onOpenChange, open }: { children: ReactNode; onOpenChange?: (open: boolean) => void; open?: boolean }) => {
    sheetSpy({ onOpenChange, open });
    return open ? <div>{children}</div> : null;
  },
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { NoctisTeamMissionPage } from "./route";

const TestPage = NoctisTeamMissionPage as unknown as (props: { loaderData: unknown }) => ReactNode;

let container: HTMLDivElement;
let root: Root | null;

async function renderPage(loaderData: { exists: boolean; requestedMissionId: string | null }) {
  root = createRoot(container);
  await act(async () => {
    root?.render(<TestPage loaderData={loaderData} />);
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  matchMock.mockReset();
  navigateMock.mockReset();
  paramsMock.mockReset();
  sheetSpy.mockReset();
  matchMock.mockReturnValue(null);
  paramsMock.mockReturnValue({ id: "mission-123" });
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  container.remove();
  vi.useRealTimers();
});

describe("noctis-team mission route", () => {
  it("renders only nested mission detail content when the mission exists", () => {
    const markup = renderToStaticMarkup(
      <TestPage loaderData={{ exists: true, requestedMissionId: "mission-123" }} />,
    );

    expect(markup).toContain("nested-route");
    expect(markup).not.toContain("screen:");
  });

  it("closes the output detail sheet before navigating back to the mission page", async () => {
    vi.useFakeTimers();
    matchMock.mockReturnValue({
      params: {
        filename: "news-run-plan.md",
        id: "mission-123",
        step: "prepare-run",
        taskId: "step_prepare-run_1",
      },
    });

    await renderPage({ exists: true, requestedMissionId: "mission-123" });

    const initialProps = sheetSpy.mock.calls.at(-1)?.[0] as
      | { onOpenChange?: (open: boolean) => void; open?: boolean }
      | undefined;

    expect(initialProps?.open).toBe(true);

    act(() => {
      initialProps?.onOpenChange?.(false);
    });

    expect(navigateMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(navigateMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(navigateMock).toHaveBeenCalledWith("/noctis-team/mission/mission-123");
  });
});