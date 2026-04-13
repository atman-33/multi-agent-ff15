import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Outlet: () => <div>nested-route</div>,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { NoctisTeamMissionPage } from "./route";

const TestPage = NoctisTeamMissionPage as unknown as (props: { loaderData: unknown }) => ReactNode;

describe("noctis-team mission route", () => {
  it("renders only nested mission detail content when the mission exists", () => {
    const markup = renderToStaticMarkup(
      <TestPage loaderData={{ exists: true, requestedMissionId: "mission-123" }} />,
    );

    expect(markup).toContain("nested-route");
    expect(markup).not.toContain("screen:");
  });
});