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
    Outlet: () => {
      const params = paramsMock();
      return params.id ? <div>nested-route</div> : null;
    },
    useLocation: () => ({ state: null }),
    useNavigate: () => navigateMock,
    useParams: () => paramsMock(),
  };
});

vi.mock("./components/noctis-team-screen", () => ({
  NoctisTeamScreen: ({ activeMissionId }: { activeMissionId: string | null }) => (
    <div>{`screen:${activeMissionId ?? "root"}`}</div>
  ),
}));

import { NoctisTeamPage } from "./route";

const TestPage = NoctisTeamPage as unknown as (props: { loaderData: unknown }) => ReactNode;

describe("noctis-team layout route", () => {
  it("renders the root screen when no mission route is active", () => {
    paramsMock.mockReturnValue({});

    const markup = renderToStaticMarkup(
      <TestPage loaderData={{ language: "other" }} />,
    );

    expect(markup).toContain("screen:root");
    expect(markup).not.toContain("nested-route");
  });

  it("keeps the mission surface screen mounted when a mission URL is active", () => {
    paramsMock.mockReturnValue({ id: "mission-123" });

    const markup = renderToStaticMarkup(
      <TestPage loaderData={{ language: "other" }} />,
    );

    expect(markup).toContain("nested-route");
    expect(markup).toContain("screen:mission-123");
  });
});