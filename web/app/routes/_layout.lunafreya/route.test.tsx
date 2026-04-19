import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { matchMock, paramsMock, navigateMock } = vi.hoisted(() => ({
  matchMock: vi.fn(),
  navigateMock: vi.fn(),
  paramsMock: vi.fn<() => { id?: string | undefined }>(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Outlet: () => {
      const params = paramsMock();
      return params.id ? <div>nested-route</div> : null;
    },
    useLocation: () => ({ state: null }),
    useMatch: () => matchMock(),
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
    matchMock.mockReturnValue(null);
    paramsMock.mockReturnValue({});

    const markup = renderToStaticMarkup(<TestPage loaderData={{ language: "other" }} />);

    expect(markup).toContain("screen:lunafreya:root");
    expect(markup).not.toContain("nested-route");
  });

  it("keeps the Lunafreya mission surface screen mounted when a mission URL is active", () => {
    matchMock.mockReturnValue(null);
    paramsMock.mockReturnValue({ id: "mission-luna" });

    const markup = renderToStaticMarkup(<TestPage loaderData={{ language: "other" }} />);

    expect(markup).toContain("nested-route");
    expect(markup).toContain("screen:lunafreya:mission-luna");
  });
});