import { Bot, Check, ChevronsUpDown } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PromptComposer } from "@/components/chat/prompt-composer";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { PromptPart } from "@/lib/prompt-parts";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";

type Agent = {
  name: string;
  description?: string;
};

type Provider = {
  id: string;
  name: string;
  models: Record<string, { id: string; name: string }>;
};

type ModelItem = {
  providerID: string;
  providerName: string;
  modelID: string;
  modelName: string;
};

type ProvidersResponse = {
  providers: Provider[];
  default: Record<string, string>;
};

type Props = {
  sessionId?: string;
  onSend: (parts: PromptPart[], options?: { agent?: string | null }) => void | Promise<unknown>;
  onAbort?: () => void;
  disabled?: boolean;
  isSessionRunning?: boolean;
  isAborting?: boolean;
  lockedAgent?: string;
  placeholder?: string;
};

type ComposerSelectionControlsProps = {
  agents: Agent[];
  modelItems: ModelItem[];
  currentModelLabel: string;
  lockedAgent?: string;
  selectedAgent: string | null;
  selectedModel: { providerID: string; modelID: string } | null;
  setSelectedAgent: (agent: string | null) => void;
  setSelectedModel: (model: { providerID: string; modelID: string }) => void;
};

const ComposerSelectionControls = memo(
  ({
    agents,
    modelItems,
    currentModelLabel,
    lockedAgent,
    selectedAgent,
    selectedModel,
    setSelectedAgent,
    setSelectedModel,
  }: ComposerSelectionControlsProps) => {
    const [agentComboboxOpen, setAgentComboboxOpen] = useState(false);
    const [modelComboboxOpen, setModelComboboxOpen] = useState(false);

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {lockedAgent ? (
          <div className="inline-flex h-8 items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-2.5 text-xs text-primary">
            <Bot className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">{lockedAgent}</span>
            <span className="rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em]">
              Locked
            </span>
          </div>
        ) : (
          <Popover open={agentComboboxOpen} onOpenChange={setAgentComboboxOpen}>
            <PopoverAnchor asChild>
              <Button
                variant="ghost"
                size="sm"
                role="combobox"
                aria-expanded={agentComboboxOpen}
                className="h-8 w-55 justify-between gap-2 px-2 text-xs text-muted-foreground"
                onClick={() => setAgentComboboxOpen((open) => !open)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Bot className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{selectedAgent ?? "Default agent"}</span>
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverAnchor>

            <PopoverContent align="start" className="w-65 p-0" side="top">
              <Command>
                <CommandInput placeholder="Search agents..." />
                <CommandList>
                  <CommandEmpty>No agent found.</CommandEmpty>
                  <CommandGroup heading="Agents">
                    <CommandItem
                      value="default agent"
                      onSelect={() => {
                        setSelectedAgent(null);
                        setAgentComboboxOpen(false);
                      }}
                    >
                      <Check
                        className={cn("h-4 w-4", !selectedAgent ? "opacity-100" : "opacity-0")}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm">Default agent</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          Use the default agent
                        </div>
                      </div>
                    </CommandItem>
                    {agents.map((agent) => (
                      <CommandItem
                        key={agent.name}
                        value={`${agent.name} ${agent.description ?? ""}`}
                        onSelect={() => {
                          setSelectedAgent(agent.name);
                          setAgentComboboxOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "h-4 w-4",
                            selectedAgent === agent.name ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm">{agent.name}</div>
                          {agent.description ? (
                            <div className="truncate text-[10px] text-muted-foreground">
                              {agent.description}
                            </div>
                          ) : null}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}

        <Popover open={modelComboboxOpen} onOpenChange={setModelComboboxOpen}>
          <PopoverAnchor asChild>
            <Button
              variant="ghost"
              size="sm"
              role="combobox"
              aria-expanded={modelComboboxOpen}
              className="h-8 w-70 justify-between gap-2 px-2 text-xs text-muted-foreground"
              onClick={() => setModelComboboxOpen((open) => !open)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{currentModelLabel}</span>
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverAnchor>

          <PopoverContent align="start" className="w-95 p-0" side="top">
            <Command>
              <CommandInput placeholder="Search models..." />
              <CommandList>
                <CommandEmpty>No model found.</CommandEmpty>
                <CommandGroup heading="Models">
                  {modelItems.map((item) => {
                    const isSelected =
                      selectedModel?.providerID === item.providerID &&
                      selectedModel?.modelID === item.modelID;

                    return (
                      <CommandItem
                        key={`${item.providerID}-${item.modelID}`}
                        value={`${item.providerName} ${item.modelName} ${item.providerID} ${item.modelID}`}
                        onSelect={() => {
                          setSelectedModel({ providerID: item.providerID, modelID: item.modelID });
                          setModelComboboxOpen(false);
                        }}
                      >
                        <Check
                          className={cn("h-4 w-4", isSelected ? "opacity-100" : "opacity-0")}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm">
                            {item.providerName} / {item.modelName}
                          </div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {item.providerID} / {item.modelID}
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);

ComposerSelectionControls.displayName = "ComposerSelectionControls";

const MessageComposer = ({
  sessionId,
  onSend,
  onAbort,
  disabled,
  isSessionRunning = false,
  isAborting = false,
  lockedAgent,
  placeholder,
}: Props) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);

  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const selectedAgent = useChatStore((state) => state.selectedAgent);
  const setSelectedAgent = useChatStore((state) => state.setSelectedAgent);

  useEffect(() => {
    const loadAgents = async () => {
      if (lockedAgent) {
        setAgents([]);
        return;
      }

      const response = await fetch("/api/agents").catch(() => null);
      if (!response?.ok) return;
      const data = (await response.json()) as { agents: Agent[] };
      setAgents(data.agents ?? []);
    };

    const loadProviders = async () => {
      const response = await fetch("/api/providers").catch(() => null);
      if (!response?.ok) return;
      const data = (await response.json()) as ProvidersResponse;
      setProviders(data.providers ?? []);
      const currentModel = useChatStore.getState().selectedModel;
      if (!currentModel && data.providers?.length) {
        const provider = data.providers[0];
        const firstModel = Object.values(provider.models ?? {})[0];
        if (provider && firstModel) {
          useChatStore
            .getState()
            .setSelectedModel({ providerID: provider.id, modelID: firstModel.id });
        }
      }
    };

    loadAgents();
    loadProviders();
  }, [lockedAgent]);

  const modelItems = useMemo<ModelItem[]>(() => {
    return providers.flatMap((provider) =>
      Object.values(provider.models ?? {}).map((model) => ({
        providerID: provider.id,
        providerName: provider.name,
        modelID: model.id,
        modelName: model.name,
      }))
    );
  }, [providers]);

  const currentModelLabel = useMemo(() => {
    const current = modelItems.find(
      (item) =>
        item.providerID === selectedModel?.providerID && item.modelID === selectedModel?.modelID
    );
    if (current) return `${current.providerName} / ${current.modelName}`;
    return "Model";
  }, [modelItems, selectedModel]);

  const getSendOptions = useCallback(() => {
    return { agent: lockedAgent ?? selectedAgent };
  }, [lockedAgent, selectedAgent]);

  return (
    <PromptComposer
      draftKey={sessionId}
      onSend={onSend}
      getSendOptions={getSendOptions}
      onAbort={onAbort}
      disabled={disabled}
      showAbortAction={isSessionRunning}
      showAbortActionWhenComposing={false}
      isAborting={isAborting}
      placeholder={placeholder}
      footerStart={
        <ComposerSelectionControls
          agents={agents}
          modelItems={modelItems}
          currentModelLabel={currentModelLabel}
          lockedAgent={lockedAgent}
          selectedAgent={selectedAgent}
          selectedModel={selectedModel}
          setSelectedAgent={setSelectedAgent}
          setSelectedModel={setSelectedModel}
        />
      }
    />
  );
};

export default MessageComposer;
