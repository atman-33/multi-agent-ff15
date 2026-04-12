import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { chatStoreStateMock, pickerPropsSpy, setAgentModelMock } = vi.hoisted(() => ({
  chatStoreStateMock: vi.fn(),
  pickerPropsSpy: vi.fn(),
  setAgentModelMock: vi.fn(),
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
  Button: ({ children, ...props }: { children?: ReactNode }) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children?: ReactNode; open?: boolean }) => (open ? <div>{children}</div> : null),
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

vi.mock("./character-card", () => ({
  CharacterCard: ({ detail, metaAccessory }: { detail?: string; metaAccessory?: ReactNode }) => (
    <div>
      {detail ? <div>{detail}</div> : null}
      {metaAccessory}
    </div>
  ),
}));

import {
  filterKnowledgeOptions,
  LunafreyaKnowledgeSelectorDialog,
  LunafreyaStatusPanel,
} from "./lunafreya-status-panel";

describe("LunafreyaStatusPanel", () => {
  beforeEach(() => {
    pickerPropsSpy.mockReset();
    setAgentModelMock.mockReset();

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

  it("filters knowledge options by name and selected-only state", () => {
    expect(
      filterKnowledgeOptions({
        knowledgeOptions: [
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
        selectedKnowledgeIds: ["hydraean"],
        query: "hyd",
        selectedOnly: true,
      }).map((option) => option.id),
    ).toEqual(["hydraean"]);
  });

  it("shows selected knowledge as a compact summary instead of the full catalog", () => {
    const markup = renderToStaticMarkup(
      <LunafreyaStatusPanel
        jobOptions={[]}
        knowledgeOptions={[
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
        onClearKnowledgeIds={() => undefined}
        onSelectedJobIdChange={() => undefined}
        onToggleKnowledgeId={() => undefined}
        selectedJobId={null}
        selectedKnowledgeIds={["hydraean"]}
        status="idle"
      />
    );

    expect(markup).toContain("Hydraean Records");
    expect(markup).toContain("1 selected");
    expect(markup).toContain("Knowledge overlays help");
    expect(markup).toContain(
      "Knowledge overlay changes are stored immediately and apply on Lunafreya&#x27;s next User turn.",
    );
    expect(markup).toContain("Open knowledge selector");
    expect(markup).not.toContain("Archive Index");
    expect(markup).not.toContain(
      "Model and overlay edits are stored immediately and will be applied when User sends the next prompt.",
    );
  });

  it("renders dialog results from the active query and selected-only filter", () => {
    const markup = renderToStaticMarkup(
      <LunafreyaKnowledgeSelectorDialog
        knowledgeOptions={[
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
        onClearKnowledgeIds={() => undefined}
        onOpenChange={() => undefined}
        onQueryChange={() => undefined}
        onSelectedOnlyChange={() => undefined}
        onToggleKnowledgeId={() => undefined}
        open
        query="hyd"
        selectedKnowledgeIds={["hydraean"]}
        selectedOnly
      />
    );

    expect(markup).toContain("Manage Knowledge Overlays");
    expect(markup).toContain("Hydraean Records");
    expect(markup).toContain("Clear All");
    expect(markup).not.toContain("Archive Index");
  });

  it("renders a model picker wired to Lunafreya's model selection", () => {
    const markup = renderToStaticMarkup(
      <LunafreyaStatusPanel
        jobOptions={[]}
        knowledgeOptions={[]}
        onClearKnowledgeIds={() => undefined}
        onSelectedJobIdChange={() => undefined}
        onToggleKnowledgeId={() => undefined}
        selectedJobId={null}
        selectedKnowledgeIds={[]}
        status="idle"
      />
    );

    expect(markup).toContain("model-picker:github-copilot/gpt-5.4:balanced");
    expect(markup).toContain("Model and facet changes apply on the next User turn.");
    expect(markup).not.toContain(
      "Model and overlay edits are stored immediately and will be applied when User sends the next prompt.",
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
});