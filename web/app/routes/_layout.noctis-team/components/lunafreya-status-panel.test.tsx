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

import { LunafreyaStatusPanel } from "./lunafreya-status-panel";

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

  it("renders a model picker wired to Lunafreya's model selection", () => {
    const markup = renderToStaticMarkup(
      <LunafreyaStatusPanel
        jobOptions={[]}
        knowledgeOptions={[]}
        onSelectedJobIdChange={() => undefined}
        onToggleKnowledgeId={() => undefined}
        selectedJobId={null}
        selectedKnowledgeIds={[]}
        status="idle"
      />
    );

    expect(markup).toContain("model-picker:github-copilot/gpt-5.4:balanced");
    expect(markup).toContain("Model and facet changes apply on the next User turn.");

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