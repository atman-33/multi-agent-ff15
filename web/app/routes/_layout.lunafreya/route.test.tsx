import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { paramsMock, navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  paramsMock: vi.fn<() => { id?: string | undefined }>(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Outlet: () => <div>nested-route</div>,
    useLocation: () => ({ state: null }),
    useNavigate: () => navigateMock,
    useParams: () => paramsMock(),
  };
});

vi.mock("../_layout.noctis-team/components/noctis-team-screen", () => ({
  NoctisTeamScreen: ({
    activeMissionId,
    surfaceId,
  }: {
    activeMissionId: string | null;
    surfaceId?: string;
  }) => <div>{`screen:${surfaceId ?? "unknown"}:${activeMissionId ?? "root"}`}</div>,
}));

import { LunafreyaPage } from "./route";

const TestPage = LunafreyaPage as unknown as (props: { loaderData: unknown }) => ReactNode;

describe("lunafreya layout route", () => {
  it("renders the Lunafreya root screen when no mission route is active", () => {
    paramsMock.mockReturnValue({});

    const markup = renderToStaticMarkup(<TestPage loaderData={{ language: "other" }} />);

    expect(markup).toContain("screen:lunafreya:root");
    expect(markup).not.toContain("nested-route");
  });

  it("renders the child mission route when a mission URL is active", () => {
    paramsMock.mockReturnValue({ id: "mission-luna" });

    const markup = renderToStaticMarkup(<TestPage loaderData={{ language: "other" }} />);

    expect(markup).toContain("nested-route");
    expect(markup).not.toContain("screen:lunafreya:mission-luna");
  });
});