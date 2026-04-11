import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/chat/prompt-composer", () => ({
  PromptComposer: ({
    topSlot,
    disableSendAction,
  }: {
    topSlot?: ReactNode;
    disableSendAction?: boolean;
  }) => (
    <div>
      <div>{disableSendAction ? "send-disabled" : "send-enabled"}</div>
      {topSlot}
    </div>
  ),
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
        contextProjects={[
          { id: "docs-repo", label: "Reference Docs" },
          { id: "api-repo", label: "API Notes" },
          { id: "ops-repo", label: "Ops Runbook" },
        ]}
        contextActionLabel="Mission Context"
        onContextAction={() => undefined}
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
    expect(markup).toContain("Context");
    expect(markup).toContain("Reference Docs");
    expect(markup).toContain("API Notes");
    expect(markup).toContain("Ops Runbook");
    expect(markup).toContain("Mission Context");
    expect(markup).toContain("Execution project help");
    expect(markup).toContain("Secondary context starts with Projects page presets.");
    expect(markup).not.toContain("+1");
    expect(markup).not.toContain("Mission Setup");
  });

  it("shows mission-start feedback and disables sending while a new mission is starting", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        isResponding={true}
        isStartingMission={true}
        showExecutionProjectSelector={true}
        executionProjectOptions={[
          { value: "core-repo", label: "Core Repo" },
          { value: "docs-repo", label: "Reference Docs" },
        ]}
        selectedExecutionProjectId="core-repo"
        executionProjectHint="Secondary context starts with Projects page presets."
        contextProjects={[]}
        contextActionLabel="Mission Context"
        onContextAction={() => undefined}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={false}
        onSelectedExecutionProjectChange={() => undefined}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Starting Mission");
    expect(markup).toContain("Preparing workspace and briefing Noctis.");
    expect(markup).toContain("/images/chocobo.png");
    expect(markup).toContain("send-disabled");
  });

  it("shows execution and context summary instead of workflow help text after mission start", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        isResponding={false}
        missionExecutionLabel="Core Repo"
        contextProjects={[
          { id: "docs-repo", label: "Reference Docs" },
          { id: "api-repo", label: "API Notes" },
          { id: "ops-repo", label: "Ops Runbook" },
        ]}
        missionActionLabel="Mission Details"
        onMissionAction={() => undefined}
        availableOperations={[
          {
            value: "builtin:noctis-autonomous",
            label: "Autonomous",
            description: "",
            isDefault: true,
            name: "noctis-autonomous",
            sourceKind: "builtin",
            sourceLabel: "Builtin",
          },
        ]}
        selectedOperation="builtin:noctis-autonomous"
        activeOperationState={null}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain(">Execution<");
    expect(markup).toContain(">Core Repo<");
    expect(markup).toContain(">Context<");
    expect(markup).toContain(">Reference Docs<");
    expect(markup).toContain(">API Notes<");
    expect(markup).toContain(">Ops Runbook<");
    expect(markup).toContain(">Workflow<");
    expect(markup).toContain(">Autonomous<");
    expect(markup).toContain("Mission Details");
    expect(markup).not.toContain("+1");
    expect(markup).not.toContain("Workflow: Workflow unavailable");
    expect(markup).not.toContain("This mission is already running with its current workflow setting.");
    expect(markup).not.toContain("Mission Workflow");
    expect(markup).not.toContain("Starting Mission");
  });
});