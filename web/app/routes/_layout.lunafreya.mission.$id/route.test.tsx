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

import { LunafreyaMissionPage } from "./route";

const TestPage = LunafreyaMissionPage as unknown as (props: { loaderData: unknown }) => ReactNode;

describe("lunafreya mission route", () => {
  it("renders only nested mission detail content when the mission exists", () => {
    const markup = renderToStaticMarkup(
      <TestPage loaderData={{ exists: true, requestedMissionId: "mission-luna" }} />,
    );

    expect(markup).toContain("nested-route");
    expect(markup).not.toContain("screen:");
  });
});