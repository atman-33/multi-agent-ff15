import { Bot, Check, ChevronsUpDown } from "lucide-react";
import { memo, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { CompactModelVariantPicker } from "@/components/compact-model-variant-picker";
import { PromptComposer } from "@/components/chat/prompt-composer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type ProjectOption = {
  value: string;
  label: string;
};

type Props = {
  sessionId?: string;
  onSend: (
    parts: PromptPart[],
    options?: { agent?: string | null }
  ) => undefined | Promise<unknown>;
  onAbort?: () => void;
  disabled?: boolean;
  disableSendAction?: boolean;
  isSessionRunning?: boolean;
  isAborting?: boolean;
  lockedAgent?: string;
  placeholder?: string;
  helperText?: ReactNode;
  executionProjectOptions?: ProjectOption[];
  selectedExecutionProjectId?: string | null;
  onSelectedExecutionProjectChange?: (projectId: string) => void;
  executionProjectLocked?: boolean;
  contextProjectOptions?: ProjectOption[];
  selectedContextProjectIds?: string[];
  contextProjectsLocked?: boolean;
  contextProjectsStatusLabel?: string;
  onToggleContextProjectId?: (projectId: string) => void;
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
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                role="combobox"
                aria-expanded={agentComboboxOpen}
                className="h-8 w-55 justify-between gap-2 px-2 text-xs text-muted-foreground"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Bot className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{selectedAgent ?? "Select agent"}</span>
                </span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>

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
  disableSendAction,
  isSessionRunning = false,
  isAborting = false,
  lockedAgent,
  placeholder,
  helperText,
  executionProjectOptions = [],
  selectedExecutionProjectId = null,
  onSelectedExecutionProjectChange,
  executionProjectLocked = false,
  contextProjectOptions = [],
  selectedContextProjectIds = [],
  contextProjectsLocked = false,
  contextProjectsStatusLabel,
  onToggleContextProjectId,
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
  const selectedExecutionProjectLabel = useMemo(
    () =>
      executionProjectOptions.find((project) => project.value === selectedExecutionProjectId)?.label ??
      null,
    [executionProjectOptions, selectedExecutionProjectId],
  );
  const selectedContextProjectLabels = useMemo(
    () =>
      selectedContextProjectIds.map(
        (projectId) =>
          contextProjectOptions.find((project) => project.value === projectId)?.label ?? projectId,
      ),
    [contextProjectOptions, selectedContextProjectIds],
  );
  const lockedContextProjectLabels =
    selectedContextProjectLabels.length > 0 ? selectedContextProjectLabels : ["None"];

  const getSendOptions = useCallback(() => {
    return { agent: lockedAgent ?? selectedAgent };
  }, [lockedAgent, selectedAgent]);

  const topSlot =
    executionProjectOptions.length > 0 || contextProjectOptions.length > 0 ? (
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/65">
            Execution Project
          </p>
          {executionProjectLocked ? (
            <div className="flex h-9 items-center rounded-md border border-border/50 bg-background/60 px-3 text-sm text-foreground">
              {selectedExecutionProjectLabel ?? "Unknown execution project"}
            </div>
          ) : (
            <Select
              value={selectedExecutionProjectId ?? undefined}
              onValueChange={onSelectedExecutionProjectChange}
            >
              <SelectTrigger className="h-9 bg-background/70 font-mono text-xs uppercase tracking-[0.14em]">
                <SelectValue placeholder="Choose execution project" />
              </SelectTrigger>
              <SelectContent>
                {executionProjectOptions.map((project) => (
                  <SelectItem key={project.value} value={project.value}>
                    {project.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/65">
            Context Projects
          </p>
          {contextProjectsLocked ? (
            <div className="flex flex-wrap items-center gap-2.5">
              {lockedContextProjectLabels.map((projectLabel) => (
                <Badge
                  key={projectLabel}
                  className="max-w-full rounded-full border-border/60 bg-background/70 px-4 py-1 text-xs font-normal text-foreground shadow-none"
                  variant="outline"
                >
                  <span className="truncate">{projectLabel}</span>
                </Badge>
              ))}
              {contextProjectsStatusLabel ? (
                <Badge
                  className="rounded-full border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-primary shadow-none"
                  variant="outline"
                >
                  {contextProjectsStatusLabel}
                </Badge>
              ) : null}
            </div>
          ) : contextProjectOptions.length > 0 ? (
            <div className="flex flex-wrap gap-2.5">
              {contextProjectOptions.map((project) => {
                const selected = selectedContextProjectIds.includes(project.value);
                return (
                  <Button
                    key={project.value}
                    type="button"
                    aria-pressed={selected}
                    variant={selected ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "rounded-full px-4",
                      selected
                        ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                        : "bg-background/70 text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                    )}
                    onClick={() => onToggleContextProjectId?.(project.value)}
                  >
                    {project.label}
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No additional registered projects available.</p>
          )}
        </div>
      </div>
    ) : undefined;

  return (
    <PromptComposer
      draftKey={sessionId}
      onSend={onSend}
      getSendOptions={getSendOptions}
      onAbort={onAbort}
      disabled={disabled}
      disableSendAction={disableSendAction}
      showAbortAction={isSessionRunning}
      showAbortActionWhenComposing={false}
      isAborting={isAborting}
      placeholder={placeholder}
      helperText={helperText}
      topSlot={topSlot}
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
