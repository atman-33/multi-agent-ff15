import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div data-slot="popover">{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => (
    <div data-slot="popover-trigger">{children}</div>
  ),
  PopoverContent: ({ children, ...props }: { children: ReactNode }) => (
    <div data-slot="popover-content" {...props}>
      {children}
    </div>
  ),
}));

import { WorkspaceLaunchActions } from "./workspace-launch-actions";

describe("WorkspaceLaunchActions", () => {
  it("renders the same split VS Code launcher used by the projects page for Linux paths", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceLaunchActions
        path="/home/atman/repos/multi-agent-ff15"
        vscodePreference="auto"
        onVSCodePreferenceChange={() => undefined}
      />,
    );

    expect(markup).toContain("Open folder");
    expect(markup).toContain("VS Code");
    expect(markup).toContain("Auto");
    expect(markup).toContain("Open in VS Code (Auto -&gt; WSL)");
    expect(markup).toContain("Choose VS Code launch mode");
    expect(markup).toContain("Auto (WSL)");
    expect(markup).toContain("Open in WSL");
    expect(markup).toContain("Open in Windows");
    expect(markup).toContain("Auto uses WSL for Linux paths and Windows for /mnt drives.");
  });

  it("shows Windows as the auto target for mounted paths", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceLaunchActions
        path="/mnt/c/Users/User/repos/multi-agent-ff15"
        vscodePreference="auto"
        onVSCodePreferenceChange={() => undefined}
      />,
    );

    expect(markup).toContain("Open in VS Code (Auto -&gt; Windows)");
    expect(markup).toContain("Auto (Windows)");
  });
});
