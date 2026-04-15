import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { locationMock, navigationMock } = vi.hoisted(() => ({
  locationMock: vi.fn(),
  navigationMock: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    NavLink: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
    Outlet: () => <div>nested-route</div>,
    useLocation: () => locationMock(),
    useNavigation: () => navigationMock(),
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/route-transition-overlay", () => ({
  RouteTransitionOverlay: () => <div />,
}));

vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
  SidebarContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  SidebarGroup: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  SidebarGroupContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SidebarHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  SidebarMenu: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuButton: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
  SidebarProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarRail: () => <div />,
  SidebarSeparator: () => <hr />,
  SidebarTrigger: () => <button type="button">Toggle</button>,
}));

import { Layout } from "./route";

const TestLayout = Layout as unknown as (props: { loaderData: unknown }) => ReactNode;

describe("app layout navigation", () => {
  beforeEach(() => {
    locationMock.mockReturnValue({ pathname: "/config" });
    navigationMock.mockReturnValue({ location: null });
  });

  it("hides OMO Config from the sidebar navigation", () => {
    const markup = renderToStaticMarkup(<TestLayout loaderData={{}} />);

    expect(markup).toContain("Skills");
    expect(markup).toContain("Config");
    expect(markup).toContain("Server Monitor");
    expect(markup).not.toContain("OMO Config");
  });

  it("keeps the hidden OMO Config route label available when opened directly", () => {
    locationMock.mockReturnValue({ pathname: "/oh-my-opencode" });

    const markup = renderToStaticMarkup(<TestLayout loaderData={{}} />);

    expect(markup.match(/OMO Config/g)).toHaveLength(1);
  });
});