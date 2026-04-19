// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Outlet: () => <div>nested-route</div>,
    useNavigate: () => navigateMock,
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { LunafreyaMissionPage } from "./route";

const TestPage = LunafreyaMissionPage as unknown as (props: { loaderData: unknown }) => ReactNode;

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
  navigateMock.mockReset();
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

describe("lunafreya mission route", () => {
  it("renders only nested mission detail content when the mission exists", () => {
    const markup = renderToStaticMarkup(
      <TestPage loaderData={{ exists: true, requestedMissionId: "mission-luna" }} />,
    );

    expect(markup).toContain("nested-route");
    expect(markup).not.toContain("screen:");
  });

  it("redirects back to the surface root when the mission is missing", async () => {
    await renderPage({ exists: false, requestedMissionId: "mission-luna" });

    expect(navigateMock).toHaveBeenCalledWith("/lunafreya", { replace: true });
  });
});