import { Check, ChevronsUpDown, Cpu, Sparkles } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
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
import { normalizeBanterAgentId } from "@/lib/banter/runtime";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import type { ModelSelection } from "@/stores/chat-store";
import type { AgentStatus } from "./character-card";
import { CharacterCard } from "./character-card";

const PRESET_AGENT_IDS = ["noctis", "ignis", "gladiolus", "prompto"] as const;

type PresetAgentId = (typeof PRESET_AGENT_IDS)[number];

export interface PartyMember {
  id: string;
  name: string;
  role: string;
  imageSrc: string;
  status: AgentStatus;
  task: string;
  detail?: string;
  progress?: number;
}

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

type ModelPreset = {
  id: string;
  label: string;
  description: string;
  available: boolean;
  unavailableAgents: PresetAgentId[];
  agentModels: Partial<Record<PresetAgentId, ModelSelection>>;
};

function normalizePartyAgentId(agentId: string): PresetAgentId | null {
  const normalized = normalizeBanterAgentId(agentId);
  return normalized && PRESET_AGENT_IDS.includes(normalized) ? normalized : null;
}

function isSameModel(left: ModelSelection | null | undefined, right: ModelSelection | null | undefined): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.providerID === right.providerID && left.modelID === right.modelID;
}

const PresetSelector = memo(
  ({
    activePresetId,
    presets,
    onSelect,
  }: {
    activePresetId: string | null;
    presets: ModelPreset[];
    onSelect: (preset: ModelPreset) => void;
  }) => {
    const [open, setOpen] = useState(false);
    const activePreset = presets.find((preset) => preset.id === activePresetId) ?? null;

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <Button
            variant="ghost"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label="Select team model preset"
            className="h-6 w-full justify-between gap-1 rounded-md border border-border/40 bg-background/20 px-2 font-mono text-[9px] uppercase tracking-[0.18em] text-primary/80 hover:text-primary"
            onClick={() => setOpen((value) => !value)}
          >
            <Sparkles className="h-2.5 w-2.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">
              {activePreset?.label ?? "Custom"}
            </span>
            <ChevronsUpDown className="h-2.5 w-2.5 shrink-0 opacity-50" />
          </Button>
        </PopoverAnchor>

        <PopoverContent align="end" className="w-80 p-0" side="bottom">
          <Command>
            <CommandInput placeholder="Search presets..." />
            <CommandList>
              <CommandEmpty>No preset found.</CommandEmpty>
              <CommandGroup heading="Presets">
                {presets.map((preset) => {
                  const isSelected = preset.id === activePresetId;
                  return (
                    <CommandItem
                      key={preset.id}
                      value={`${preset.label} ${preset.id} ${preset.description}`}
                      disabled={!preset.available}
                      onSelect={() => {
                        if (!preset.available) {
                          return;
                        }

                        onSelect(preset);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                      <div className="min-w-0">
                        <div className="truncate text-sm">{preset.label}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {preset.available
                            ? preset.description || preset.id
                            : `Unavailable for ${preset.unavailableAgents.join(", ")}`}
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
    );
  }
);

PresetSelector.displayName = "PresetSelector";

const AgentModelPicker = memo(
  ({
    agentId,
    modelItems,
    selectedModel,
    onSelect,
  }: {
    agentId: string;
    modelItems: ModelItem[];
    selectedModel: ModelSelection | null;
    onSelect: (model: ModelSelection | null) => void;
  }) => {
    const [open, setOpen] = useState(false);

    const label = useMemo(() => {
      if (!selectedModel) return null;
      const found = modelItems.find(
        (m) => m.providerID === selectedModel.providerID && m.modelID === selectedModel.modelID
      );
      if (found) return found.modelName;
      const fallback = selectedModel.modelID.split("/").pop();
      return fallback && fallback.length > 0 ? fallback : selectedModel.modelID;
    }, [modelItems, selectedModel]);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <Button
            variant="ghost"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label={`Select model for ${agentId}`}
            className={cn(
              "h-6 w-full justify-between gap-1 rounded-md border border-border/40 bg-background/20 px-2 font-mono text-[9px] uppercase tracking-[0.18em]",
              selectedModel
                ? "text-primary/80 hover:text-primary"
                : "text-muted-foreground/50 hover:text-muted-foreground"
            )}
            onClick={() => setOpen((v) => !v)}
          >
            <Cpu className="h-2.5 w-2.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{label ?? "model"}</span>
            <ChevronsUpDown className="h-2.5 w-2.5 shrink-0 opacity-50" />
          </Button>
        </PopoverAnchor>

        <PopoverContent align="end" className="w-96 p-0" side="bottom">
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
                        onSelect({ providerID: item.providerID, modelID: item.modelID });
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
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
    );
  }
);

AgentModelPicker.displayName = "AgentModelPicker";

interface PartyStatusPanelProps {
  members: PartyMember[];
}

export const PartyStatusPanel = ({ members }: PartyStatusPanelProps) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [presets, setPresets] = useState<ModelPreset[]>([]);
  const agentModels = useChatStore((state) => state.agentModels);
  const setAgentModel = useChatStore((state) => state.setAgentModel);
  const setAgentModels = useChatStore((state) => state.setAgentModels);

  useEffect(() => {
    const load = async () => {
      const [providersRes, presetsRes] = await Promise.all([
        fetch("/api/providers").catch(() => null),
        fetch("/api/noctis-team/model-presets").catch(() => null),
      ]);

      if (providersRes?.ok) {
        const data = (await providersRes.json()) as { providers?: Provider[] };
        setProviders(data.providers ?? []);
      }

      if (presetsRes?.ok) {
        const data = (await presetsRes.json()) as { presets?: ModelPreset[] };
        setPresets(data.presets ?? []);
      }
    };
    void load();
  }, []);

  const modelItems = useMemo<ModelItem[]>(
    () =>
      providers.flatMap((provider) =>
        Object.values(provider.models ?? {}).map((model) => ({
          providerID: provider.id,
          providerName: provider.name,
          modelID: model.id,
          modelName: model.name,
        }))
      ),
    [providers]
  );

  const activePresetId = useMemo(() => {
    const match = presets.find((preset) =>
      PRESET_AGENT_IDS.every((agentId) => isSameModel(agentModels[agentId], preset.agentModels[agentId]))
    );

    return match?.id ?? null;
  }, [agentModels, presets]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2 border-border/50 border-b pb-2">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Party Status
        </span>
        <div className="ml-auto font-mono text-[10px] text-muted-foreground/50">
          {members.filter((m) => m.status === "working").length} active
        </div>
      </div>

      {presets.length > 0 ? (
        <div className="shrink-0">
          <PresetSelector
            activePresetId={activePresetId}
            presets={presets}
            onSelect={(preset) => {
              const nextModels = Object.fromEntries(
                PRESET_AGENT_IDS.map((agentId) => [agentId, preset.agentModels[agentId] ?? null])
              ) as Record<string, ModelSelection | null>;
              setAgentModels(nextModels);
            }}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {members.map((member) => {
          const normalizedAgentId = normalizePartyAgentId(member.id);

          return (
            <div key={member.id}>
              <CharacterCard
                {...member}
                metaAccessory={
                  <AgentModelPicker
                    agentId={member.id}
                    modelItems={modelItems}
                    selectedModel={normalizedAgentId ? agentModels[normalizedAgentId] ?? null : null}
                    onSelect={(model) => {
                      if (!normalizedAgentId) {
                        return;
                      }

                      setAgentModel(normalizedAgentId, model);
                    }}
                  />
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
