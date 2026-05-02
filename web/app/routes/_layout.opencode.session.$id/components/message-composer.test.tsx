import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/chat/prompt-composer", () => ({
  PromptComposer: ({
    topSlot,
    footerStart,
    helperText,
    disableSendAction,
  }: {
    topSlot?: ReactNode;
    footerStart?: ReactNode;
    helperText?: ReactNode;
    disableSendAction?: boolean;
  }) => (
    <div data-disable-send-action={disableSendAction ? "true" : "false"}>
      <div>{topSlot}</div>
      <div>{footerStart}</div>
      <div>{helperText}</div>
    </div>
  ),
}));

vi.mock("@/components/compact-model-variant-picker", () => ({
  CompactModelVariantPicker: () => <div>model-picker</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
}));

vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandInput: () => <input />,
  CommandItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("@/stores/chat-store", () => ({
  useChatStore: (selector: (state: {
    selectedAgent: string | null;
    selectedModel: null;
    setSelectedAgent: (agent: string | null) => void;
    setSelectedModel: (model: unknown) => void;
  }) => unknown) =>
    selector({
      selectedAgent: null,
      selectedModel: null,
      setSelectedAgent: () => undefined,
      setSelectedModel: () => undefined,
    }),
}));

import MessageComposer from "./message-composer";

describe("opencode message composer", () => {
  it("shows execution and context controls for a new session draft", () => {
    const markup = renderToStaticMarkup(
      <MessageComposer
        sessionId="draft"
        executionProjectOptions={[
          { value: "app_root", label: "App Root (multi-agent-ff15)" },
          { value: "alpha", label: "Alpha Project" },
        ]}
        selectedExecutionProjectId="app_root"
        contextProjectOptions={[
          { value: "alpha", label: "Alpha Project" },
          { value: "beta", label: "Beta Project" },
        ]}
        selectedContextProjectIds={["beta"]}
        onSelectedExecutionProjectChange={() => undefined}
        onToggleContextProjectId={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Execution Project");
    expect(markup).toContain("Context Projects");
    expect(markup).toContain("App Root (multi-agent-ff15)");
    expect(markup).toContain("Alpha Project");
    expect(markup).toContain("Beta Project");
  });

  it("shows a locked execution project label while keeping context controls editable", () => {
    const markup = renderToStaticMarkup(
      <MessageComposer
        sessionId="session-1"
        executionProjectOptions={[
          { value: "app_root", label: "App Root (multi-agent-ff15)" },
          { value: "alpha", label: "Alpha Project" },
        ]}
        selectedExecutionProjectId="alpha"
        executionProjectLocked={true}
        contextProjectOptions={[{ value: "beta", label: "Beta Project" }]}
        selectedContextProjectIds={[]}
        onToggleContextProjectId={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Execution Project");
    expect(markup).toContain("Alpha Project");
    expect(markup).toContain("Context Projects");
    expect(markup).toContain("Beta Project");
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).not.toContain("Choose execution project");
  });

  it("shows mission-managed context as a locked summary", () => {
    const markup = renderToStaticMarkup(
      <MessageComposer
        sessionId="session-managed"
        executionProjectOptions={[{ value: "alpha", label: "Alpha Project" }]}
        selectedExecutionProjectId="alpha"
        executionProjectLocked={true}
        contextProjectOptions={[{ value: "beta", label: "Beta Project" }]}
        selectedContextProjectIds={["beta"]}
        contextProjectsLocked={true}
        contextProjectsStatusLabel="Managed by mission"
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Alpha Project");
    expect(markup).toContain("Beta Project");
    expect(markup).toContain("Managed by mission");
  });

  it("surfaces a disabled-send notice for tmux-resident sessions", () => {
    const markup = renderToStaticMarkup(
      <MessageComposer
        sessionId="session-tmux"
        disableSendAction={true}
        helperText="Tmux mode is active. Send messages from the tmux pane instead."
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain('data-disable-send-action="true"');
    expect(markup).toContain("Tmux mode is active. Send messages from the tmux pane instead.");
  });
});