import { Bot, Check, ChevronsUpDown } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { CompactModelVariantPicker } from "@/components/compact-model-variant-picker";
import { PromptComposer } from "@/components/chat/prompt-composer";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  flattenProviderModels,
  type ModelCatalogItem,
  type OpencodeProvider,
  type OpencodeProvidersResponse,
} from "@/lib/opencode-provider-catalog";
import type { PromptPart } from "@/lib/prompt-parts";
import type { ModelSelection } from "@/lib/types/mission";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";

type Agent = {
  name: string;
  description?: string;
};

type Props = {
  sessionId?: string;
  onSend: (
    parts: PromptPart[],
    options?: { agent?: string | null }
  ) => undefined | Promise<unknown>;
  onAbort?: () => void;
  disabled?: boolean;
  isSessionRunning?: boolean;
  isAborting?: boolean;
  lockedAgent?: string;
  placeholder?: string;
};

type ComposerSelectionControlsProps = {
  agents: Agent[];
  modelItems: ModelCatalogItem[];
  lockedAgent?: string;
  selectedAgent: string | null;
  selectedModel: ModelSelection | null;
  setSelectedAgent: (agent: string | null) => void;
  setSelectedModel: (model: ModelSelection) => void;
  variantsByModel: Record<string, string[]>;
};

const ComposerSelectionControls = memo(
  ({
    agents,
    modelItems,
    lockedAgent,
    selectedAgent,
    selectedModel,
    setSelectedAgent,
    setSelectedModel,
    variantsByModel,
  }: ComposerSelectionControlsProps) => {
    const [agentComboboxOpen, setAgentComboboxOpen] = useState(false);

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
                  <span className="truncate">{selectedAgent ?? "Select agent"}</span>
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

        <CompactModelVariantPicker
          ariaLabel="Select model"
          contentAlign="start"
          contentSide="top"
          emptyLabel="Model"
          modelItems={modelItems}
          onSelect={setSelectedModel}
          selectedModel={selectedModel}
          triggerClassName="h-8 w-70 px-2 text-xs text-muted-foreground"
          variantsByModel={variantsByModel}
        />
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
  const [providers, setProviders] = useState<OpencodeProvider[]>([]);
  const [variantsByModel, setVariantsByModel] = useState<Record<string, string[]>>({});

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
      const nextAgents = data.agents ?? [];
      setAgents(nextAgents);

      if (!nextAgents.length) {
        return;
      }

      const currentAgent = useChatStore.getState().selectedAgent;
      const hasCurrentAgent = currentAgent
        ? nextAgents.some((agent) => agent.name === currentAgent)
        : false;

      if (!hasCurrentAgent) {
        useChatStore.getState().setSelectedAgent(nextAgents[0].name);
      }
    };

    const loadProviders = async () => {
      const response = await fetch("/api/providers").catch(() => null);
      if (!response?.ok) return;
      const data = (await response.json()) as OpencodeProvidersResponse;
      setProviders(data.providers ?? []);
      setVariantsByModel(data.variantsByModel ?? {});
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

  const modelItems = useMemo<ModelCatalogItem[]>(() => flattenProviderModels(providers), [providers]);

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
          lockedAgent={lockedAgent}
          selectedAgent={selectedAgent}
          selectedModel={selectedModel}
          setSelectedAgent={setSelectedAgent}
          setSelectedModel={setSelectedModel}
          variantsByModel={variantsByModel}
        />
      }
    />
  );
};

export default MessageComposer;
