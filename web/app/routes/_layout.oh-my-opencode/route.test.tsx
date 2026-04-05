import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/oh-my-opencode-config.server", () => ({
  readOhMyOpenCodeData: vi.fn(),
}));

vi.mock("@/components/page-container", () => ({
  PageContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  AlertDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <div>{placeholder}</div>,
}));

import { OhMyOpenCodePage } from "./route";

const TestPage = OhMyOpenCodePage as unknown as (props: { loaderData: unknown }) => ReactNode;

describe("oh-my-opencode route", () => {
  it("renders current variants and fallback variant options", () => {
    const markup = renderToStaticMarkup(
      <TestPage
        loaderData={{
          catalog: {
            generatedAt: "2026-04-05T00:00:00.000Z",
            refreshState: "ready",
            stale: false,
          },
          config: {
            agents: {
              oracle: {
                model: "github-copilot/gpt-5.4",
                variant: "legacy",
              },
            },
            categories: {},
          },
          isInstalled: true,
          models: ["github-copilot/gpt-5.4"],
          variantsByModel: {
            "github-copilot/gpt-5.4": ["medium", "high"],
          },
          version: "1.2.3",
        } as never}
      />,
    );

    expect(markup).toContain("Variant: legacy");
    expect(markup).toContain("Default");
    expect(markup).toContain("legacy (current)");
    expect(markup).toContain("medium");
    expect(markup).toContain("high");
  });

  it("renders the catalog warning state", () => {
    const markup = renderToStaticMarkup(
      <TestPage
        loaderData={{
          catalog: {
            generatedAt: "2026-04-05T00:00:00.000Z",
            lastError: "refresh failed",
            refreshState: "error",
            stale: true,
          },
          config: {
            agents: {},
            categories: {},
          },
          isInstalled: true,
          models: [],
          variantsByModel: {},
          version: "1.2.3",
        } as never}
      />,
    );

    expect(markup).toContain("Catalog stale");
    expect(markup).toContain("Model catalog warning");
    expect(markup).toContain("refresh failed");
    expect(markup).toContain("Refresh");
  });
});