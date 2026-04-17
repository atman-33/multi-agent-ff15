import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div data-slot="popover">{children}</div>,
  PopoverAnchor: ({ children }: { children: ReactNode }) => (
    <div data-slot="popover-anchor">{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => (
    <div data-slot="popover-trigger">{children}</div>
  ),
  PopoverContent: ({
    children,
    collisionPadding: _collisionPadding,
    onOpenAutoFocus: _onOpenAutoFocus,
    portalContainer,
    sideOffset: _sideOffset,
    ...props
  }: {
    children: ReactNode;
    collisionPadding?: number;
    onOpenAutoFocus?: (event: Event) => void;
    portalContainer?: HTMLElement | null;
    sideOffset?: number;
  }) => (
    <div data-portal-container={portalContainer ? "set" : "unset"} data-slot="popover-content" {...props}>
      {children}
    </div>
  ),
}));

import { CompactModelVariantPicker } from "./compact-model-variant-picker";

describe("CompactModelVariantPicker", () => {
  it("renders simplified rows and explicit variant options without a visible default entry", () => {
    const markup = renderToStaticMarkup(
      <CompactModelVariantPicker
        ariaLabel="Select model"
        emptyLabel="Model"
        modelItems={[
          {
            providerID: "github-copilot",
            providerName: "GitHub Copilot",
            modelID: "gpt-5.4",
            modelName: "GPT-5.4",
          },
        ]}
        onSelect={() => undefined}
        selectedModel={null}
        variantsByModel={{
          "github-copilot/gpt-5.4": ["medium", "high"],
        }}
      />
    );

    expect(markup).toContain("GPT-5.4");
    expect(markup).toContain("GitHub Copilot");
  expect(markup).toContain('data-slot="popover-trigger"');
    expect(markup).not.toContain("github-copilot / gpt-5.4");
    expect(markup).toContain("Open variants for GPT-5.4");
    expect(markup).toContain("Explicit variants");
    expect(markup).toContain("medium");
    expect(markup).toContain("high");
    expect(markup).not.toContain(">Default<");
  });

  it("does not render a variant opener when a model has no explicit variants", () => {
    const markup = renderToStaticMarkup(
      <CompactModelVariantPicker
        ariaLabel="Select model"
        emptyLabel="Model"
        modelItems={[
          {
            providerID: "github-copilot",
            providerName: "GitHub Copilot",
            modelID: "grok-code-fast-1",
            modelName: "Grok Code Fast 1",
          },
        ]}
        onSelect={() => undefined}
        selectedModel={null}
        variantsByModel={{
          "github-copilot/grok-code-fast-1": [],
        }}
      />
    );

    expect(markup).not.toContain("Open variants for Grok Code Fast 1");
    expect(markup).not.toContain("Explicit variants");
  });

  it("forwards an explicit portal container to its popover content", () => {
    const portalContainer = {} as HTMLElement;
    const markup = renderToStaticMarkup(
      <CompactModelVariantPicker
        ariaLabel="Select model"
        emptyLabel="Model"
        modelItems={[
          {
            providerID: "github-copilot",
            providerName: "GitHub Copilot",
            modelID: "gpt-5.4",
            modelName: "GPT-5.4",
          },
        ]}
        onSelect={() => undefined}
        portalContainer={portalContainer}
        selectedModel={null}
        variantsByModel={{
          "github-copilot/gpt-5.4": ["high"],
        }}
      />
    );

    expect(markup).toContain('data-portal-container="set"');
  });
});