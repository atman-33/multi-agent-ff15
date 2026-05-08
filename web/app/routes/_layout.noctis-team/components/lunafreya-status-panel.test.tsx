import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  chatStoreStateMock,
  contextMenuItemPropsSpy,
  formatSwitchMissionAgentPaneSessionSuccessMessageMock,
  pickerPropsSpy,
  setAgentModelMock,
  switchMissionAgentPaneSessionMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  chatStoreStateMock: vi.fn(),
  contextMenuItemPropsSpy: vi.fn(),
  formatSwitchMissionAgentPaneSessionSuccessMessageMock: vi.fn(),
  pickerPropsSpy: vi.fn(),
  setAgentModelMock: vi.fn(),
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
  CompactModelVariantPicker: (props: {
    ariaLabel: string;
    onSelect: (model: { providerID: string; modelID: string; variant?: string }) => void;
    selectedModel: { providerID: string; modelID: string; variant?: string } | null;
  }) => {
    pickerPropsSpy(props);

    return (
      <div>
        {`model-picker:${props.selectedModel ? `${props.selectedModel.providerID}/${props.selectedModel.modelID}` : "none"}${props.selectedModel?.variant ? `:${props.selectedModel.variant}` : ""}`}
      </div>
    );
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children?: ReactNode; open?: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
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
      agentModels: {
        lunafreya?: { providerID: string; modelID: string; variant?: string } | null;
      };
      setAgentModel: typeof setAgentModelMock;
    }) => unknown
  ) => selector(chatStoreStateMock()),
}));

vi.mock("./switch-pane-session", () => ({
  formatSwitchMissionAgentPaneSessionSuccessMessage:
    formatSwitchMissionAgentPaneSessionSuccessMessageMock,
  switchMissionAgentPaneSession: switchMissionAgentPaneSessionMock,
}));

vi.mock("./character-card", () => ({
  CharacterCard: ({ detail, metaAccessory }: { detail?: string; metaAccessory?: ReactNode }) => (
    <div>
      {detail ? <div>{detail}</div> : null}
      {metaAccessory}
    </div>
  ),
}));

import {
  filterSkillOptions,
  LunafreyaSkillSelectorDialog,
  LunafreyaStatusPanel,
} from "./lunafreya-status-panel";

describe("LunafreyaStatusPanel", () => {
  beforeEach(() => {
    contextMenuItemPropsSpy.mockReset();
    formatSwitchMissionAgentPaneSessionSuccessMessageMock.mockReset();
    pickerPropsSpy.mockReset();
    setAgentModelMock.mockReset();
    switchMissionAgentPaneSessionMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();

    chatStoreStateMock.mockReturnValue({
      agentModels: {
        lunafreya: {
          providerID: "github-copilot",
          modelID: "gpt-5.4",
          variant: "balanced",
        },
      },
      setAgentModel: setAgentModelMock,
    });
  });

  it("filters skill options by name and selected-only state", () => {
    expect(
      filterSkillOptions({
        skillOptions: [
          {
            id: "hydraean",
            label: "Hydraean Records",
            description: "Oracle field notes",
            sourceKind: "builtin",
            sourceLabel: "Builtin",
          },
          {
            id: "archive-index",
            label: "Archive Index",
            description: "Background archive catalog",
            sourceKind: "project",
            sourceLabel: "Project Atlas",
          },
        ],
        selectedSkillIds: ["hydraean"],
        query: "hyd",
        selectedOnly: true,
      }).map((option) => option.id)
    ).toEqual(["hydraean"]);
  });

  it("shows selected skills as a compact summary instead of the full catalog", () => {
    const markup = renderToStaticMarkup(
      <LunafreyaStatusPanel
        jobOptions={[]}
        skillOptions={[
          {
            id: "hydraean",
            label: "Hydraean Records",
            description: "Oracle field notes",
            sourceKind: "builtin",
            sourceLabel: "Builtin",
          },
          {
            id: "archive-index",
            label: "Archive Index",
            description: "Background archive catalog",
            sourceKind: "project",
            sourceLabel: "Project Atlas",
          },
        ]}
        onClearSkillIds={() => undefined}
        onSelectedJobIdChange={() => undefined}
        onToggleSkillId={() => undefined}
        selectedJobId={null}
        selectedSkillIds={["hydraean"]}
        status="idle"
      />
    );

    expect(markup).toContain("Hydraean Records");
    expect(markup).toContain("1 selected");
    expect(markup).toContain("Skills help");
    expect(markup).toContain(
      "Skill changes are stored immediately and apply on Lunafreya&#x27;s next User turn."
    );
    expect(markup).toContain("Open skills selector");
    expect(markup).not.toContain("Archive Index");
    expect(markup).not.toContain(
      "Model and overlay edits are stored immediately and will be applied when User sends the next prompt."
    );
  });

  it("renders the default Job label instead of a no-job overlay option", () => {
    const markup = renderToStaticMarkup(
      <LunafreyaStatusPanel
        jobOptions={[
          {
            id: "builtin:ja:jobs/strategist.md",
            label: "Strategic Advisor",
            description: "Adds structured strategic framing.",
            sourceKind: "builtin",
            sourceLabel: "Builtin",
          },
        ]}
        skillOptions={[]}
        onClearSkillIds={() => undefined}
        onSelectedJobIdChange={() => undefined}
        onToggleSkillId={() => undefined}
        selectedJobId={null}
        selectedSkillIds={[]}
        status="idle"
      />
    );

    expect(markup).toContain("Job");
    expect(markup).toContain("Default (Lunafreya Autonomous)");
    expect(markup).toContain("Strategic Advisor");
    expect(markup).not.toContain("Job Overlay");
    expect(markup).not.toContain("No job overlay");
  });

  it("renders dialog results from the active query and selected-only filter", () => {
    const markup = renderToStaticMarkup(
      <LunafreyaSkillSelectorDialog
        skillOptions={[
          {
            id: "hydraean",
            label: "Hydraean Records",
            description: "Oracle field notes",
            sourceKind: "builtin",
            sourceLabel: "Builtin",
          },
          {
            id: "archive-index",
            label: "Archive Index",
            description: "Background archive catalog",
            sourceKind: "project",
            sourceLabel: "Project Atlas",
          },
        ]}
        onClearSkillIds={() => undefined}
        onOpenChange={() => undefined}
        onQueryChange={() => undefined}
        onSelectedOnlyChange={() => undefined}
        onToggleSkillId={() => undefined}
        open
        query="hyd"
        selectedSkillIds={["hydraean"]}
        selectedOnly
      />
    );

    expect(markup).toContain("Manage Skills");
    expect(markup).toContain("Hydraean Records");
    expect(markup).toContain("Clear All");
    expect(markup).not.toContain("Archive Index");
  });

  it("renders a model picker wired to Lunafreya's model selection", () => {
    const markup = renderToStaticMarkup(
      <LunafreyaStatusPanel
        jobOptions={[]}
        skillOptions={[]}
        onClearSkillIds={() => undefined}
        onSelectedJobIdChange={() => undefined}
        onToggleSkillId={() => undefined}
        selectedJobId={null}
        selectedSkillIds={[]}
        status="idle"
      />
    );

    expect(markup).toContain("model-picker:github-copilot/gpt-5.4:balanced");
    expect(markup).toContain("Model and facet changes apply on the next User turn.");
    expect(markup).not.toContain(
      "Model and overlay edits are stored immediately and will be applied when User sends the next prompt."
    );

    const pickerProps = pickerPropsSpy.mock.calls[0]?.[0] as {
      ariaLabel: string;
      onSelect: (model: { providerID: string; modelID: string; variant?: string }) => void;
    };

    expect(pickerProps.ariaLabel).toBe("Select model for lunafreya");

    pickerProps.onSelect({
      providerID: "anthropic",
      modelID: "claude-sonnet-4",
      variant: "high",
    });

    expect(setAgentModelMock).toHaveBeenCalledWith("lunafreya", {
      providerID: "anthropic",
      modelID: "claude-sonnet-4",
      variant: "high",
    });
  });

  it("shows a current-mission pane session switch action when a Lunafreya mission session exists", () => {
    const markup = renderToStaticMarkup(
      <LunafreyaStatusPanel
        hasMissionSession
        jobOptions={[]}
        missionId="mission-luna"
        skillOptions={[]}
        onClearSkillIds={() => undefined}
        onSelectedJobIdChange={() => undefined}
        onToggleSkillId={() => undefined}
        selectedJobId={null}
        selectedSkillIds={[]}
        status="idle"
      />
    );

    expect(markup).toMatch(
      /<button[^>]*data-disabled="false"[^>]*aria-label="Switch Lunafreya pane to current mission session"/
    );
    expect(markup).toContain("Switch To Current Mission Session");
  });

  it("keeps the current-mission pane session switch action enabled while Lunafreya is working", () => {
    const markup = renderToStaticMarkup(
      <LunafreyaStatusPanel
        hasMissionSession
        jobOptions={[]}
        missionId="mission-luna"
        skillOptions={[]}
        onClearSkillIds={() => undefined}
        onSelectedJobIdChange={() => undefined}
        onToggleSkillId={() => undefined}
        selectedJobId={null}
        selectedSkillIds={[]}
        status="working"
      />
    );

    expect(markup).toMatch(
      /<button[^>]*data-disabled="false"[^>]*aria-label="Switch Lunafreya pane to current mission session"/
    );
  });

  it("invokes pane session switching for Lunafreya when the current mission session exists", async () => {
    const switchResult = {
      agentId: "lunafreya",
      missionId: "mission-luna",
      sessionId: "session-luna",
      sessionTitle: "mission:mission-luna:lunafreya",
    };
    switchMissionAgentPaneSessionMock.mockResolvedValue(switchResult);
    formatSwitchMissionAgentPaneSessionSuccessMessageMock.mockReturnValue(
      "Switched Lunafreya to the current mission session."
    );

    renderToStaticMarkup(
      <LunafreyaStatusPanel
        hasMissionSession
        jobOptions={[]}
        missionId="mission-luna"
        skillOptions={[]}
        onClearSkillIds={() => undefined}
        onSelectedJobIdChange={() => undefined}
        onToggleSkillId={() => undefined}
        selectedJobId={null}
        selectedSkillIds={[]}
        status="idle"
      />
    );

    const actionProps = contextMenuItemPropsSpy.mock.calls
      .map(([props]) => props)
      .find(
        (props) =>
          typeof props === "object" &&
          props !== null &&
          (props as { "aria-label"?: string })["aria-label"] ===
            "Switch Lunafreya pane to current mission session"
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
      agentId: "lunafreya",
      missionId: "mission-luna",
    });
    expect(formatSwitchMissionAgentPaneSessionSuccessMessageMock).toHaveBeenCalledWith(
      switchResult
    );
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Switched Lunafreya to the current mission session."
    );
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
