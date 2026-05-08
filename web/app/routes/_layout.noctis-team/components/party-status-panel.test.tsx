import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createOperationState } from "@/lib/operation-runtime/state";
import type { PartyMember } from "@/lib/noctis-team-ui-types";

const {
  chatStoreStateMock,
  contextMenuItemPropsSpy,
  formatSwitchMissionAgentPaneSessionSuccessMessageMock,
  switchMissionAgentPaneSessionMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  chatStoreStateMock: vi.fn(),
  contextMenuItemPropsSpy: vi.fn(),
  formatSwitchMissionAgentPaneSessionSuccessMessageMock: vi.fn(),
  switchMissionAgentPaneSessionMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock("@/components/compact-model-variant-picker", () => ({
  CompactModelVariantPicker: () => <div>model-picker</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CommandInput: (props: Record<string, unknown>) => <input {...props} />,
  CommandItem: ({ children, ...props }: { children?: ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  CommandList: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ContextMenuContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({
    children,
    disabled,
    onSelect,
    ...props
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onSelect?: (event: { preventDefault: () => void }) => void;
  }) => {
    contextMenuItemPropsSpy({ children, disabled, onSelect, ...props });

    return (
      <button
        data-disabled={disabled ? "true" : "false"}
        disabled={disabled}
        onClick={() => onSelect?.({ preventDefault: () => undefined })}
        {...props}
      >
        {children}
      </button>
    );
  },
  ContextMenuLabel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ContextMenuSeparator: () => <hr />,
}));

vi.mock("@/stores/chat-store", () => ({
  useChatStore: (
    selector: (state: {
      agentModels: Record<string, null>;
      workingParty: Record<string, boolean>;
      setAgentModel: (agentId: string, model: unknown) => void;
      setAgentModels: (models: Record<string, unknown>) => void;
      setWorkingPartyMember: (agentId: string, included: boolean) => void;
    }) => unknown
  ) => selector(chatStoreStateMock()),
}));

vi.mock("./switch-pane-session", () => ({
  formatSwitchMissionAgentPaneSessionSuccessMessage:
    formatSwitchMissionAgentPaneSessionSuccessMessageMock,
  switchMissionAgentPaneSession: switchMissionAgentPaneSessionMock,
}));

vi.mock("./character-card", () => ({
  CharacterCard: ({
    name,
    statusAccessory,
    metaAccessory,
  }: {
    name: string;
    statusAccessory?: ReactNode;
    metaAccessory?: ReactNode;
  }) => (
    <section>
      <h2>{name}</h2>
      {statusAccessory}
      {metaAccessory}
    </section>
  ),
}));

import { PartyStatusPanel } from "./party-status-panel";

const partyMembers: PartyMember[] = [
  { id: "noctis", name: "Noctis", role: "Leader", status: "idle", imageSrc: "/noctis.png" },
  { id: "ignis", name: "Ignis", role: "Analyst", status: "idle", imageSrc: "/ignis.png" },
  {
    id: "gladiolus",
    name: "Gladiolus",
    role: "Implementer",
    status: "working",
    imageSrc: "/gladiolus.png",
  },
  { id: "prompto", name: "Prompto", role: "Reviewer", status: "idle", imageSrc: "/prompto.png" },
];

function createActiveOperationState(agent: "noctis" | "ignis" | "gladiolus" | "prompto") {
  const state = createOperationState(
    "review-cycle-test",
    "implement",
    "builtin:ja:review-cycle-test.yaml"
  );
  state.currentStep = "implement";
  state.status = "waiting_for_report";
  state.stepHistory = [
    {
      step: "implement",
      agent,
      taskId: "task-1",
      status: "dispatched",
      dispatchedAt: "2026-05-01T00:00:00.000Z",
    },
  ];
  return state;
}

describe("PartyStatusPanel", () => {
  beforeEach(() => {
    contextMenuItemPropsSpy.mockReset();
    formatSwitchMissionAgentPaneSessionSuccessMessageMock.mockReset();
    chatStoreStateMock.mockReturnValue({
      agentModels: {
        noctis: null,
        ignis: null,
        gladiolus: null,
        prompto: null,
      },
      workingParty: {
        ignis: true,
        gladiolus: true,
        prompto: true,
      },
      setAgentModel: () => undefined,
      setAgentModels: () => undefined,
      setWorkingPartyMember: () => undefined,
    });
    switchMissionAgentPaneSessionMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it("enables resume only on the worker card that owns the active step", () => {
    const markup = renderToStaticMarkup(
      <PartyStatusPanel
        members={partyMembers}
        missionId="mission-123"
        activeOperationState={createActiveOperationState("gladiolus")}
        speakingAgentId={null}
      />
    );

    expect(markup).toMatch(
      /<button[^>]*data-disabled="true"[^>]*aria-label="Resume active worker step for Ignis"/
    );
    expect(markup).toMatch(
      /<button[^>]*data-disabled="false"[^>]*aria-label="Resume active worker step for Gladiolus"/
    );
    expect(markup).toMatch(
      /<button[^>]*data-disabled="true"[^>]*aria-label="Resume active worker step for Prompto"/
    );
  });

  it("disables worker resume actions when the active step is not worker-owned", () => {
    const markup = renderToStaticMarkup(
      <PartyStatusPanel
        members={partyMembers}
        missionId="mission-123"
        activeOperationState={createActiveOperationState("noctis")}
        speakingAgentId={null}
      />
    );

    expect(markup).toMatch(
      /<button[^>]*data-disabled="true"[^>]*aria-label="Resume active worker step for Ignis"/
    );
    expect(markup).toMatch(
      /<button[^>]*data-disabled="true"[^>]*aria-label="Resume active worker step for Gladiolus"/
    );
    expect(markup).toMatch(
      /<button[^>]*data-disabled="true"[^>]*aria-label="Resume active worker step for Prompto"/
    );
  });

  it("shows current-mission pane session switching only when the agent card is switchable", () => {
    const markup = renderToStaticMarkup(
      <PartyStatusPanel
        members={partyMembers}
        missionId="mission-123"
        activeOperationState={createActiveOperationState("noctis")}
        speakingAgentId={null}
        hasMissionSessionByAgent={{
          noctis: true,
          ignis: true,
          gladiolus: true,
          prompto: false,
        }}
      />
    );

    expect(markup).toMatch(
      /<button[^>]*data-disabled="false"[^>]*aria-label="Switch Ignis pane to current mission session"/
    );
    expect(markup).toMatch(
      /<button[^>]*data-disabled="false"[^>]*aria-label="Switch Gladiolus pane to current mission session"/
    );
    expect(markup).toMatch(
      /<button[^>]*data-disabled="true"[^>]*aria-label="Switch Prompto pane to current mission session"/
    );
    expect(markup).toContain("Mission Session Unavailable");
  });

  it("keeps the current-mission switch action enabled for the runtime Gladio member id", () => {
    const markup = renderToStaticMarkup(
      <PartyStatusPanel
        members={[
          {
            id: "gladio",
            name: "Gladio",
            role: "Executor",
            status: "idle",
            imageSrc: "/gladiolus.png",
          },
        ]}
        missionId="mission-123"
        activeOperationState={createActiveOperationState("noctis")}
        speakingAgentId={null}
        hasMissionSessionByAgent={{
          gladiolus: true,
        }}
      />
    );

    expect(markup).toMatch(
      /<button[^>]*data-disabled="false"[^>]*aria-label="Switch Gladio pane to current mission session"/
    );
  });

  it("invokes pane session switching for an enabled party member action", async () => {
    const switchResult = {
      agentId: "ignis",
      missionId: "mission-123",
      sessionId: "session-ignis",
      sessionTitle: "mission:mission-123:ignis",
    };
    switchMissionAgentPaneSessionMock.mockResolvedValue(switchResult);
    formatSwitchMissionAgentPaneSessionSuccessMessageMock.mockReturnValue(
      "Switched Ignis to the current mission session."
    );

    renderToStaticMarkup(
      <PartyStatusPanel
        members={partyMembers}
        missionId="mission-123"
        activeOperationState={createActiveOperationState("noctis")}
        speakingAgentId={null}
        hasMissionSessionByAgent={{
          ignis: true,
        }}
      />
    );

    const actionProps = contextMenuItemPropsSpy.mock.calls
      .map(([props]) => props)
      .find(
        (props) =>
          typeof props === "object" &&
          props !== null &&
          (props as { "aria-label"?: string })["aria-label"] ===
            "Switch Ignis pane to current mission session"
      ) as
      | {
          onSelect?: (event: { preventDefault: () => void }) => void;
        }
      | undefined;

    expect(actionProps).toBeTruthy();
    actionProps?.onSelect?.({ preventDefault: () => undefined });
    await Promise.resolve();
    await Promise.resolve();

    expect(switchMissionAgentPaneSessionMock).toHaveBeenCalledWith({
      agentId: "ignis",
      missionId: "mission-123",
    });
    expect(formatSwitchMissionAgentPaneSessionSuccessMessageMock).toHaveBeenCalledWith(
      switchResult
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Switched Ignis to the current mission session.");
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
