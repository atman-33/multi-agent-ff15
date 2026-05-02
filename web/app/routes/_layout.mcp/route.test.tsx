import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, className }: { children: ReactNode; className?: string }) => (
    <button className={className} type="button">
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className }: { children: ReactNode; className?: string }) => (
    <section className={className}>{children}</section>
  ),
  CardContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }: { children: ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked }: { checked?: boolean }) => <span>{checked ? "on" : "off"}</span>,
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children, className }: { children: ReactNode; className?: string }) => (
    <section className={className}>{children}</section>
  ),
  AlertDescription: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  AlertTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/page-container", () => ({
  PageContainer: ({ children, className }: { children: ReactNode; className?: string }) => (
    <main className={className}>{children}</main>
  ),
}));

import { McpPage } from "./route";

const TestPage = McpPage as unknown as (props: { loaderData: unknown }) => ReactNode;

describe("mcp route", () => {
  it("renders a restart warning and actions when tmux transport needs restart", () => {
    const markup = renderToStaticMarkup(
      <TestPage
        loaderData={{
          initialData: {
            config: {
              mcp: {
                alpha: {
                  command: ["alpha-mcp"],
                  enabled: false,
                  type: "local",
                },
              },
            },
            transportStatus: {
              bootstrapStatus: {
                agentCount: 6,
                configState: "valid",
                configStatePath: "/tmp/runtime/tmux-transport-config-state.json",
                dispatcherPid: 4321,
                dispatcherState: "valid",
                dispatcherStatePath: "/tmp/runtime/tmux-transport-dispatcher.json",
                endpointManifestPath: "/tmp/runtime/opencode-endpoints.json",
                endpointManifestState: "valid",
                error: null,
                isReady: true,
                lastStartedAt: "2026-05-02T00:00:00.000Z",
                restartRequired: true,
                warning:
                  "The tmux transport is running with an outdated opencode.json configuration; restart required.",
              },
              error: null,
              isReady: true,
              transportMode: "tmux-resident",
            },
          },
          initialFetchError: null,
        } as never}
      />,
    );

    expect(markup).toContain("Restart required");
    expect(markup).toContain("Restart Transport");
    expect(markup).toContain("Confirm Restart Transport");
    expect(markup).toContain("recreates the tmux session and interrupts in-flight OpenCode work");
    expect(markup).toContain("Open Tmux Monitor");
    expect(markup).toContain("outdated opencode.json");
  });
});