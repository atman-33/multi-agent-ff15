import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/components/page-container", () => ({
  PageContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  AlertDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) => (
    <button disabled={disabled} type="button">
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/lib/opencode-server", () => ({
  getOpencodeServerStatus: vi.fn(),
}));

import { OpenCodeServerPage, performForceRestartRequest } from "./route";

const TestPage = OpenCodeServerPage as unknown as (props: { loaderData: unknown }) => ReactNode;

const runningStatus = {
  checkedAt: "2026-04-12T00:00:00.000Z",
  error: null,
  foreignServerUrl: null,
  forceRestart: {
    availability: "available" as const,
    reason: null,
  },
  isRunning: true,
  lastStartedAt: "2026-04-12T00:00:00.000Z",
  managedByApp: true,
  recoveryBlocked: false,
  state: "running" as const,
  url: "http://127.0.0.1:45211",
  warning: null,
};

describe("server route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an enabled Force Restart button for a running app-owned server", () => {
    const markup = renderToStaticMarkup(
      <TestPage loaderData={{ initialStatus: runningStatus } as never} />,
    );

    expect(markup).toContain("Force Restart");
    expect(markup).toContain("Confirm Force Restart");
    expect(markup).toContain(">Force Restart</button>");
    expect(markup).not.toContain("<button disabled=\"\" type=\"button\">Force Restart</button>");
  });

  it("renders a disabled Force Restart button when the app-owned server is unavailable", () => {
    const markup = renderToStaticMarkup(
      <TestPage
        loaderData={{
          initialStatus: {
            ...runningStatus,
            error: "Force restart is available only for a running app-owned OpenCode server",
            forceRestart: {
              availability: "unavailable" as const,
              reason: "Force restart is available only for a running app-owned OpenCode server",
            },
            isRunning: false,
            managedByApp: false,
            state: "down",
            url: null,
          },
        } as never}
      />,
    );

    expect(markup).toContain("Force Restart");
    expect(markup).toContain("<button disabled=\"\" type=\"button\">Force Restart</button>");
  });

  it("renders blocked force-restart messaging for a healthy unreclaimed app-owned server", () => {
    const markup = renderToStaticMarkup(
      <TestPage
        loaderData={{
          initialStatus: {
            ...runningStatus,
            error: "Failed to reclaim app-owned OpenCode server process 34567",
            forceRestart: {
              availability: "blocked" as const,
              reason: "Failed to reclaim app-owned OpenCode server process 34567",
            },
            recoveryBlocked: true,
          },
        } as never}
      />,
    );

    expect(markup).toContain("Force restart blocked");
    expect(markup).toContain("Failed to reclaim app-owned OpenCode server process 34567");
    expect(markup).not.toContain("Force restart unavailable");
  });

  it("sends the force-restart request body", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(runningStatus), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const status = await performForceRestartRequest({
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/opencode-server",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "force-restart" }),
      }),
    );
    expect(status).toMatchObject({
      isRunning: true,
      managedByApp: true,
      url: "http://127.0.0.1:45211",
    });
  });
});