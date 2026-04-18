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

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    disabled,
    "aria-label": ariaLabel,
  }: {
    checked?: boolean;
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <button
      aria-label={ariaLabel}
      data-disabled={disabled ? "yes" : "no"}
      data-state={checked ? "checked" : "unchecked"}
      type="button"
    />
  ),
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
        selectedExecutionTargetMode="execution_project"
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
        onSelectedExecutionTargetModeChange={() => undefined}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Execution Project");
    expect(markup).toContain("Operation");
    expect(markup).toContain("Context");
    expect(markup).toContain("Reference Docs");
    expect(markup).toContain("API Notes");
    expect(markup).toContain("Ops Runbook");
    expect(markup).toContain("Mission Context");
    expect(markup).toContain("Execution project help");
    expect(markup).toContain("Secondary context starts with Projects page presets.");
    expect(markup).toContain("Dedicated workspace");
    expect(markup).toContain("Execution mode help");
    expect(markup).toContain("Work directly in the registered project folder");
    expect(markup).toContain("Create a mission-specific workspace and work there");
    expect(markup).toContain('data-state="unchecked"');
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
        selectedExecutionTargetMode="execution_project"
        contextProjects={[]}
        contextActionLabel="Mission Context"
        onContextAction={() => undefined}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={false}
        onSelectedExecutionProjectChange={() => undefined}
        onSelectedExecutionTargetModeChange={() => undefined}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Starting Mission");
    expect(markup).toContain("Preparing mission and briefing Noctis.");
    expect(markup).toContain("/images/chocobo.png");
    expect(markup).toContain("send-disabled");
    expect(markup).toContain('data-state="unchecked"');
    expect(markup).toContain('data-disabled="yes"');
  });

  it("shows execution and context summary instead of operation help text after mission start", () => {
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
    expect(markup).toContain(
      'class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-3 py-1.5 text-[11px] shadow-sm"><span class="font-mono text-[10px] uppercase tracking-[0.16em] text-primary/70">Context</span>',
    );
    expect(markup).toContain(">Operation<");
    expect(markup).toContain(">Autonomous<");
    expect(markup).toContain("Mission Details");
    expect(markup).not.toContain("+1");
    expect(markup).not.toContain("Operation: Operation unavailable");
    expect(markup).not.toContain("This mission is already running with its current operation setting.");
    expect(markup).not.toContain("Mission Operation");
    expect(markup).not.toContain("Starting Mission");
    expect(markup).not.toContain("Operation Progress");
  });

  it("shows compact operation progress and revisit details in the header", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        isResponding={false}
        missionExecutionLabel="Core Repo"
        contextProjects={[{ id: "docs-repo", label: "Reference Docs" }]}
        missionActionLabel="Mission Details"
        onMissionAction={() => undefined}
        availableOperations={[]}
        selectedOperation="builtin:ja:openspec-dev.yaml"
        activeOperationState={null}
        workflowProgress={{
          workflowLabel: "openspec-dev",
          currentStep: "review",
          currentStepIndex: 3,
          totalSteps: 5,
          status: "waiting_for_report",
          updatedAt: "2026-04-11T00:16:00.000Z",
          visitCount: 2,
          isTerminal: false,
        }}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Operation");
    expect(markup).toContain("3/5");
    expect(markup).toContain("Waiting");
    expect(markup).toContain("review");
    expect(markup).toContain("openspec-dev");
    expect(markup).toContain("Pass 2");
  });

  it("keeps terminal operation progress visible in the header", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        isResponding={false}
        missionExecutionLabel="Core Repo"
        contextProjects={[]}
        missionActionLabel="Mission Details"
        onMissionAction={() => undefined}
        availableOperations={[]}
        selectedOperation="builtin:ja:openspec-dev.yaml"
        activeOperationState={null}
        workflowProgress={{
          workflowLabel: "openspec-dev",
          currentStep: "refactor",
          currentStepIndex: 5,
          totalSteps: 5,
          status: "complete",
          updatedAt: "2026-04-11T00:20:00.000Z",
          visitCount: 1,
          isTerminal: true,
        }}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Operation");
    expect(markup).toContain("5/5");
    expect(markup).toContain("Done");
    expect(markup).toContain("refactor");
  });

  it("removes active-mission header shortcuts", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        isResponding={false}
        isSessionActive={true}
        missionExecutionLabel="Core Repo"
        contextProjects={[]}
        availableOperations={[]}
        selectedOperation="builtin:ja:openspec-dev.yaml"
        activeOperationState={null}
        workflowProgress={{
          workflowLabel: "openspec-dev",
          currentStep: "review",
          currentStepIndex: 3,
          totalSteps: 5,
          status: "waiting_for_report",
          updatedAt: "2026-04-11T00:16:00.000Z",
          visitCount: 1,
          isTerminal: false,
        }}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).not.toContain("Radio Incoming");
    expect(markup).not.toContain("Outputs");
  });

  it("shows an explicit loading state while mission history is still hydrating", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        historyPhase="loading"
        isResponding={true}
        isLoadingHistory={true}
        missionExecutionLabel="Core Repo"
        contextProjects={[]}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Loading Session History");
    expect(markup).toContain("Refreshing the sanitized transcript for this mission.");
    expect(markup).toContain("send-disabled");
    expect(markup).toContain("Loading mission transcript...");
  });

  it("shows an explicit empty state when the mission transcript resolves without messages", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        historyPhase="empty"
        isResponding={false}
        missionExecutionLabel="Core Repo"
        contextProjects={[]}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("No Session History Yet");
    expect(markup).toContain("This mission has not produced a transcript yet.");
    expect(markup).toContain("send-enabled");
  });

  it("shows a transcript error state distinct from an empty transcript", () => {
    const markup = renderToStaticMarkup(
      <ChatArea
        messages={[]}
        historyErrorMessage="Unable to load mission transcript."
        historyPhase="error"
        isResponding={false}
        missionExecutionLabel="Core Repo"
        contextProjects={[]}
        availableOperations={[]}
        selectedOperation={null}
        activeOperationState={null}
        isOperationSelectionLocked={true}
        onSelectedOperationChange={() => undefined}
        onSend={() => undefined}
      />,
    );

    expect(markup).toContain("Transcript Load Failed");
    expect(markup).toContain("Unable to load mission transcript.");
    expect(markup).not.toContain("No Session History Yet");
  });
});