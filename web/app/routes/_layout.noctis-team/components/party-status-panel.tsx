import { Check, ChevronsUpDown, Cpu, Sparkles } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { CompactModelVariantPicker } from "@/components/compact-model-variant-picker";
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
import { normalizeBanterAgentId } from "@/lib/banter/runtime";
import { areModelSelectionsEqual } from "@/lib/model-variant-selection";
import {
  flattenProviderModels,
  type ModelCatalogItem,
  type OpencodeProvider,
  type OpencodeProvidersResponse,
} from "@/lib/opencode-provider-catalog";
import {
  getAllowedWorkers,
  getCompactWorkingPartySummary,
  isWorkingPartyMemberId,
  normalizeWorkingPartyMemberId,
} from "@/lib/noctis-working-party";
import type { PartyMember } from "@/lib/noctis-team-ui-types";
import type { ModelSelection } from "@/lib/types/mission";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { CharacterCard } from "./character-card";

const PRESET_AGENT_IDS = ["noctis", "ignis", "gladiolus", "prompto"] as const;

type PresetAgentId = (typeof PRESET_AGENT_IDS)[number];

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
  switch (normalized) {
    case "noctis":
    case "ignis":
    case "gladiolus":
    case "prompto":
      return normalized;
    default:
      return null;
  }
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
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label="Select team model preset"
            className="h-6 w-full justify-between gap-1 rounded-md border border-border/40 bg-background/20 px-2 font-mono text-[9px] uppercase tracking-[0.18em] text-primary/80 hover:text-primary"
          >
            <Sparkles className="h-2.5 w-2.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">
              {activePreset?.label ?? "Custom"}
            </span>
            <ChevronsUpDown className="h-2.5 w-2.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

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
    variantsByModel,
    onSelect,
  }: {
    agentId: string;
    modelItems: ModelCatalogItem[];
    selectedModel: ModelSelection | null;
    variantsByModel: Record<string, string[]>;
    onSelect: (model: ModelSelection | null) => void;
  }) => {
    return (
      <CompactModelVariantPicker
        ariaLabel={`Select model for ${agentId}`}
        contentAlign="end"
        contentSide="bottom"
        emptyLabel="model"
        modelItems={modelItems}
        onSelect={(model) => onSelect(model)}
        selectedModel={selectedModel}
        showProviderName={false}
        triggerClassName={cn(
          "h-6 w-full rounded-md border border-border/40 bg-background/20 px-2 font-mono text-[9px] uppercase tracking-[0.18em]",
          selectedModel
            ? "text-primary/80 hover:text-primary"
            : "text-muted-foreground/50 hover:text-muted-foreground"
        )}
        triggerIcon={<Cpu className="h-2.5 w-2.5 shrink-0" />}
        variantsByModel={variantsByModel}
      />
    );
  }
);

AgentModelPicker.displayName = "AgentModelPicker";

interface PartyStatusPanelProps {
  members: PartyMember[];
  speakingAgentId?: string | null;
}

export const PartyStatusPanel = ({ members, speakingAgentId = null }: PartyStatusPanelProps) => {
  const [providers, setProviders] = useState<OpencodeProvider[]>([]);
  const [presets, setPresets] = useState<ModelPreset[]>([]);
  const [variantsByModel, setVariantsByModel] = useState<Record<string, string[]>>({});
  const agentModels = useChatStore((state) => state.agentModels);
  const workingParty = useChatStore((state) => state.workingParty);
  const setAgentModel = useChatStore((state) => state.setAgentModel);
  const setAgentModels = useChatStore((state) => state.setAgentModels);
  const setWorkingPartyMember = useChatStore((state) => state.setWorkingPartyMember);

  useEffect(() => {
    const load = async () => {
      const [providersRes, presetsRes] = await Promise.all([
        fetch("/api/providers").catch(() => null),
        fetch("/api/noctis-team/model-presets").catch(() => null),
      ]);

      if (providersRes?.ok) {
        const data = (await providersRes.json()) as OpencodeProvidersResponse;
        setProviders(data.providers ?? []);
        setVariantsByModel(data.variantsByModel ?? {});
      }

      if (presetsRes?.ok) {
        const data = (await presetsRes.json()) as { presets?: ModelPreset[] };
        setPresets(data.presets ?? []);
      }
    };
    void load();
  }, []);

  const modelItems = useMemo<ModelCatalogItem[]>(
    () => flattenProviderModels(providers),
    [providers]
  );

  const activePresetId = useMemo(() => {
    const match = presets.find((preset) =>
      PRESET_AGENT_IDS.every((agentId) =>
        areModelSelectionsEqual(agentModels[agentId], preset.agentModels[agentId])
      )
    );

    return match?.id ?? null;
  }, [agentModels, presets]);

  const allowedWorkers = useMemo(() => getAllowedWorkers(workingParty), [workingParty]);
  const compactWorkingPartySummary = useMemo(
    () => getCompactWorkingPartySummary(allowedWorkers),
    [allowedWorkers]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2 border-border/50 border-b pb-2">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Party Status
        </span>
        <div className="ml-auto min-w-0 max-w-44 truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
          {compactWorkingPartySummary}
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
          const workingPartyAgentId = normalizeWorkingPartyMemberId(member.id);
          const isWorker = workingPartyAgentId
            ? isWorkingPartyMemberId(workingPartyAgentId)
            : false;
          const isNoctis = normalizedAgentId === "noctis";
          const isInParty = isNoctis
            ? true
            : workingPartyAgentId
              ? workingParty[workingPartyAgentId]
              : false;

          const segmentBaseClass =
            "h-6 rounded-full border px-0 font-mono text-[8px] font-semibold uppercase tracking-[0.16em] transition-all";

          const partyControl = isNoctis ? (
            <fieldset
              className="grid w-full cursor-not-allowed grid-cols-2 gap-1 rounded-full border border-border/40 bg-muted/20 p-0.5"
              aria-label="Noctis party membership locked"
            >
              <div
                className={cn(
                  segmentBaseClass,
                  "flex items-center justify-center border-border/50 bg-muted/60 text-foreground/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                )}
              >
                In
              </div>
              <div
                className={cn(
                  segmentBaseClass,
                  "flex items-center justify-center border-border/20 bg-background/10 text-muted-foreground/30"
                )}
              >
                Out
              </div>
            </fieldset>
          ) : isWorker && workingPartyAgentId ? (
            <fieldset
              className="grid w-full grid-cols-2 gap-1 rounded-full border border-border/30 bg-background/25 p-0.5"
              aria-label={`${member.name} party membership`}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  segmentBaseClass,
                  isInParty
                    ? "border-emerald-400/30 bg-emerald-400/12 text-emerald-200 hover:bg-emerald-400/16 hover:text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "border-border/20 bg-transparent text-muted-foreground/55 hover:border-border/35 hover:text-muted-foreground"
                )}
                aria-pressed={isInParty}
                onClick={() => setWorkingPartyMember(workingPartyAgentId, true)}
              >
                In
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  segmentBaseClass,
                  !isInParty
                    ? "border-rose-400/30 bg-rose-400/12 text-rose-200 hover:bg-rose-400/16 hover:text-rose-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "border-border/20 bg-transparent text-muted-foreground/55 hover:border-border/35 hover:text-muted-foreground"
                )}
                aria-pressed={!isInParty}
                onClick={() => setWorkingPartyMember(workingPartyAgentId, false)}
              >
                Out
              </Button>
            </fieldset>
          ) : (
            <div aria-hidden="true" className="invisible h-6 w-full rounded-md border px-2" />
          );

          return (
            <div key={member.id}>
              <CharacterCard
                {...member}
                agentId={normalizedAgentId ?? member.id}
                isInParty={isWorker ? isInParty : true}
                isSpeaking={normalizedAgentId === speakingAgentId}
                statusAccessory={partyControl}
                metaAccessory={
                  <AgentModelPicker
                    agentId={member.id}
                    modelItems={modelItems}
                    selectedModel={
                      normalizedAgentId ? (agentModels[normalizedAgentId] ?? null) : null
                    }
                    variantsByModel={variantsByModel}
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
