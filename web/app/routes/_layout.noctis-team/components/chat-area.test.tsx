import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/chat/prompt-composer", () => ({
  PromptComposer: ({ topSlot }: { topSlot?: ReactNode }) => <div>{topSlot}</div>,
}));

vi.mock("@/components/chat/thread-frame", () => ({
  ChatThreadFrame: ({
    header,
    footer,
    children,
  }: {
    header?: ReactNode;
    footer?: ReactNode;
    children?: () => ReactNode;
  }) => (
    <div>
      <div>{header}</div>
      <div>{footer}</div>
      <div>{children?.()}</div>
    </div>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/use-conversation-unit-inspectability", () => ({
  useConversationUnitInspectability: () => ({
    isConversationUnitExpanded: () => false,
    expandedDetailEntriesByConversationUnit: {},
    toggleConversationUnit: () => undefined,
    toggleDetailEntry: () => undefined,
  }),
}));

vi.mock("@/hooks/use-session-chat-render-snapshot", () => ({
  useSessionChatRenderSnapshot: () => ({
    autoFollowKey: "empty",
    inspectabilityBoundaries: [],
    scrollSignal: 0,
    renderedMessages: [],
  }),
}));

vi.mock("@/stores/chat-store", () => ({
  useChatStore: (selector: (state: { workingParty: string[] }) => unknown) =>
    selector({ workingParty: [] }),
}));

import { ChatArea } from "./chat-area";

describe("chat-area", () => {
  it("shows compact execution project controls without the old setup heading", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        isResponding={false}
        showExecutionProjectSelector={true}
        executionProjectOptions={[
          { value: "core-repo", label: "Core Repo" },
          { value: "docs-repo", label: "Reference Docs" },
        ]}
        selectedExecutionProjectId="core-repo"
        executionProjectHint="Secondary context starts with Projects page presets."
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={false}
        onSelectedExecutionProjectChange={() => undefined}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Execution Project");
    expect(markup).toContain("Workflow");
    expect(markup).toContain("Execution project help");
    expect(markup).toContain("Secondary context starts with Projects page presets.");
    expect(markup).not.toContain("Mission Setup");
  });
});