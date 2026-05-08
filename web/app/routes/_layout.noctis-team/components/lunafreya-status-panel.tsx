import { BrainCircuit, Cpu, Info, Layers3, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CompactModelVariantPicker } from "@/components/compact-model-variant-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  flattenProviderModels,
  type ModelCatalogItem,
  type OpencodeProvider,
  type OpencodeProvidersResponse,
} from "@/lib/opencode-provider-catalog";
import { DEFAULT_LUNAFREYA_JOB_LABEL } from "@/lib/lunafreya-prompt-context";
import type { AgentStatus } from "@/lib/noctis-team-ui-types";
import type { AgentContextUsage } from "@/lib/types/mission";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { CharacterCard } from "./character-card";
import {
  continueMissionAgentSession,
  formatContinueMissionAgentSessionSuccessMessage,
} from "./continue-mission-session";
import {
  formatSwitchMissionAgentPaneSessionSuccessMessage,
  switchMissionAgentPaneSession,
} from "./switch-pane-session";

export type LunafreyaFacetOption = {
  id: string;
  label: string;
  description: string | null;
  sourceKind: "builtin" | "project";
  sourceLabel: string;
};

type LunafreyaStatusPanelProps = {
  contextUsage?: AgentContextUsage | null;
  missionId?: string | null;
  hasMissionSession?: boolean;
  status: AgentStatus;
  isSpeaking?: boolean;
  selectedJobId: string | null;
  selectedSkillIds: string[];
  jobOptions: LunafreyaFacetOption[];
  skillOptions: LunafreyaFacetOption[];
  onSelectedJobIdChange: (jobId: string | null) => void;
  onToggleSkillId: (skillId: string) => void;
  onClearSkillIds: () => void;
};

const NO_JOB_VALUE = "__none__";

const LUNAFREYA_CARD_COPY = {
  name: "Lunafreya",
  role: "Oracle",
} as const;

export function getSelectedSkillOptions(
  skillOptions: LunafreyaFacetOption[],
  selectedSkillIds: string[]
): LunafreyaFacetOption[] {
  const optionsById = new Map(skillOptions.map((option) => [option.id, option]));

  return selectedSkillIds.flatMap((skillId) => {
    const option = optionsById.get(skillId);
    return option ? [option] : [];
  });
}

export function filterSkillOptions(input: {
  skillOptions: LunafreyaFacetOption[];
  selectedSkillIds: string[];
  query: string;
  selectedOnly: boolean;
}): LunafreyaFacetOption[] {
  const normalizedQuery = input.query.trim().toLowerCase();

  return input.skillOptions.filter((option) => {
    if (input.selectedOnly && !input.selectedSkillIds.includes(option.id)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return option.label.toLowerCase().includes(normalizedQuery);
  });
}

type LunafreyaSkillSelectorDialogProps = {
  open: boolean;
  skillOptions: LunafreyaFacetOption[];
  selectedSkillIds: string[];
  query: string;
  selectedOnly: boolean;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelectedOnlyChange: (selectedOnly: boolean) => void;
  onToggleSkillId: (skillId: string) => void;
  onClearSkillIds: () => void;
};

export function LunafreyaSkillSelectorDialog({
  open,
  skillOptions,
  selectedSkillIds,
  query,
  selectedOnly,
  onOpenChange,
  onQueryChange,
  onSelectedOnlyChange,
  onToggleSkillId,
  onClearSkillIds,
}: LunafreyaSkillSelectorDialogProps) {
  const filteredSkillOptions = useMemo(
    () =>
      filterSkillOptions({
        skillOptions,
        selectedSkillIds,
        query,
        selectedOnly,
      }),
    [query, selectedOnly, selectedSkillIds, skillOptions]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] overflow-hidden p-0 sm:max-h-[min(85vh,48rem)] sm:max-w-2xl">
        <DialogHeader className="border-border/50 border-b px-4 pt-4 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <DialogTitle>Manage Skills</DialogTitle>
              <DialogDescription>
                Search available skills, review descriptions, and update Lunafreya&#39;s next-turn
                skill set.
              </DialogDescription>
            </div>
            <Badge
              className="rounded-full font-mono text-[10px] uppercase tracking-[0.16em]"
              variant="outline"
            >
              {`${selectedSkillIds.length} selected`}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-3 px-4 pt-3 pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                aria-label="Search skills"
                className="pl-9"
                onChange={(event) => onQueryChange(event.currentTarget.value)}
                placeholder="Search skills by name"
                type="search"
                value={query}
              />
            </div>
            <Button
              aria-pressed={selectedOnly}
              className="sm:shrink-0"
              onClick={() => onSelectedOnlyChange(!selectedOnly)}
              type="button"
              variant={selectedOnly ? "secondary" : "outline"}
            >
              Selected Only
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground/75">
            <p>{`${filteredSkillOptions.length} results`}</p>
            {selectedSkillIds.length > 0 ? (
              <Button
                className="h-7 px-2.5 font-mono text-[10px] uppercase tracking-[0.16em]"
                onClick={onClearSkillIds}
                size="sm"
                type="button"
                variant="outline"
              >
                Clear All
              </Button>
            ) : null}
          </div>

          <ScrollArea className="max-h-[min(58vh,26rem)] rounded-lg border border-border/50 bg-background/40">
            <div className="space-y-2 p-2">
              {skillOptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground/75">
                  No skills available for the current execution project.
                </div>
              ) : filteredSkillOptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground/75">
                  No skills match the current filter.
                </div>
              ) : (
                filteredSkillOptions.map((option) => {
                  const isSelected = selectedSkillIds.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      aria-pressed={isSelected}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                        isSelected
                          ? "border-primary/40 bg-primary/10"
                          : "border-border/50 bg-card/40 hover:bg-card/70"
                      )}
                      onClick={() => onToggleSkillId(option.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-sm text-foreground/90">
                            {option.label}
                          </p>
                          <p className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                            {option.sourceLabel}
                          </p>
                        </div>
                        {isSelected ? (
                          <span className="rounded-full border border-primary/25 bg-primary/12 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                            Active
                          </span>
                        ) : null}
                      </div>
                      {option.description ? (
                        <p className="mt-1 text-xs leading-5 text-muted-foreground/80">
                          {option.description}
                        </p>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LunafreyaStatusPanel({
  contextUsage = null,
  missionId = null,
  hasMissionSession = false,
  status,
  isSpeaking = false,
  selectedJobId,
  selectedSkillIds,
  jobOptions,
  skillOptions,
  onSelectedJobIdChange,
  onToggleSkillId,
  onClearSkillIds,
}: LunafreyaStatusPanelProps) {
  const [providers, setProviders] = useState<OpencodeProvider[]>([]);
  const [variantsByModel, setVariantsByModel] = useState<Record<string, string[]>>({});
  const [isSkillSelectorOpen, setIsSkillSelectorOpen] = useState(false);
  const [isSendingContinue, setIsSendingContinue] = useState(false);
  const [isSwitchingSession, setIsSwitchingSession] = useState(false);
  const [skillQuery, setSkillQuery] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const selectedModel = useChatStore((state) => state.agentModels.lunafreya ?? null);
  const setAgentModel = useChatStore((state) => state.setAgentModel);

  useEffect(() => {
    let isMounted = true;

    const loadProviders = async () => {
      const response = await fetch("/api/providers").catch(() => null);
      if (!response?.ok || !isMounted) {
        return;
      }

      const data = (await response.json()) as OpencodeProvidersResponse;
      if (!isMounted) {
        return;
      }

      setProviders(data.providers ?? []);
      setVariantsByModel(data.variantsByModel ?? {});
    };

    void loadProviders();

    return () => {
      isMounted = false;
    };
  }, []);

  const modelItems = useMemo<ModelCatalogItem[]>(
    () => flattenProviderModels(providers),
    [providers]
  );
  const selectedSkillOptions = useMemo(
    () => getSelectedSkillOptions(skillOptions, selectedSkillIds),
    [selectedSkillIds, skillOptions]
  );

  useEffect(() => {
    if (isSkillSelectorOpen) {
      return;
    }

    setSkillQuery("");
    setSelectedOnly(false);
  }, [isSkillSelectorOpen]);

  const switchActionDisabled = !missionId || !hasMissionSession || isSwitchingSession;
  const switchActionLabel = !hasMissionSession
    ? "Mission Session Unavailable"
    : "Switch To Current Mission Session";
  const continueActionDisabled = !missionId || !hasMissionSession || isSendingContinue;

  const handleSwitchMissionPaneSession = async () => {
    if (!missionId || !hasMissionSession || isSwitchingSession) {
      return;
    }

    setIsSwitchingSession(true);
    try {
      const result = await switchMissionAgentPaneSession({
        missionId,
        agentId: "lunafreya",
      });
      toast.success(formatSwitchMissionAgentPaneSessionSuccessMessage(result));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to switch pane session");
    } finally {
      setIsSwitchingSession(false);
    }
  };

  const handleContinueMissionSession = async () => {
    if (!missionId || !hasMissionSession || isSendingContinue) {
      return;
    }

    setIsSendingContinue(true);
    try {
      const result = await continueMissionAgentSession({
        missionId,
        agentId: "lunafreya",
      });
      toast.success(formatContinueMissionAgentSessionSuccessMessage(result));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to send raw continue");
    } finally {
      setIsSendingContinue(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2 border-border/50 border-b pb-2">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Lunafreya Status
        </span>
      </div>

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div>
            <CharacterCard
              agentId="lunafreya"
              contextUsage={contextUsage}
              detail="Model and facet changes apply on the next User turn."
              imageSrc="/images/lunafreya.png"
              isInParty
              isSpeaking={isSpeaking}
              metaAccessory={
                <CompactModelVariantPicker
                  ariaLabel="Select model for lunafreya"
                  contentAlign="end"
                  contentSide="bottom"
                  emptyLabel="model"
                  modelItems={modelItems}
                  onSelect={(model) => setAgentModel("lunafreya", model)}
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
              }
              {...LUNAFREYA_CARD_COPY}
              status={status}
            />
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent>
          <ContextMenuLabel>{LUNAFREYA_CARD_COPY.name}</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuItem
            aria-label="Switch Lunafreya pane to current mission session"
            disabled={switchActionDisabled}
            onSelect={() => {
              void handleSwitchMissionPaneSession();
            }}
          >
            {switchActionLabel}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            aria-label="Send raw continue to Lunafreya mission session"
            disabled={continueActionDisabled}
            onSelect={() => {
              void handleContinueMissionSession();
            }}
          >
            Continue
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <div className="space-y-3 rounded-xl border border-border/50 bg-card/40 p-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Layers3 className="h-3.5 w-3.5 text-primary/80" />
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              Job
            </p>
          </div>
          <Select
            value={selectedJobId ?? NO_JOB_VALUE}
            onValueChange={(value) => onSelectedJobIdChange(value === NO_JOB_VALUE ? null : value)}
          >
            <SelectTrigger className="h-9 bg-background/70 text-sm">
              <SelectValue placeholder="Select a job" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_JOB_VALUE}>{DEFAULT_LUNAFREYA_JOB_LABEL}</SelectItem>
              {jobOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <BrainCircuit className="h-3.5 w-3.5 text-primary/80" />
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                Skills
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Skills help"
                    className="h-4 w-4 rounded-full border border-border/50 p-0 font-mono text-[10px] text-muted-foreground/80"
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Info className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-72 text-xs leading-relaxed">
                  Skill changes are stored immediately and apply on Lunafreya&#39;s next User turn.
                </TooltipContent>
              </Tooltip>
            </div>
            {skillOptions.length > 0 ? (
              <Button
                aria-label="Open skills selector"
                className="h-7 w-7 rounded-full"
                onClick={() => setIsSkillSelectorOpen(true)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>

          <div className="space-y-2 rounded-lg border border-border/50 bg-background/40 px-3 py-3">
            {skillOptions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground/75">
                No skills available for the current execution project.
              </div>
            ) : selectedSkillOptions.length > 0 ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                    {`${selectedSkillOptions.length} selected`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSkillOptions.map((option) => (
                    <Badge
                      key={option.id}
                      className="max-w-full rounded-full text-xs font-medium"
                      variant="outline"
                    >
                      <span className="truncate">{option.label}</span>
                    </Badge>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-foreground/85">No skills selected.</p>
                <p className="text-xs text-muted-foreground/75">
                  Use the selector to browse the catalog and activate the skills Lunafreya should
                  use on the next User turn.
                </p>
              </div>
            )}
          </div>
        </div>

        <LunafreyaSkillSelectorDialog
          skillOptions={skillOptions}
          onClearSkillIds={onClearSkillIds}
          onOpenChange={setIsSkillSelectorOpen}
          onQueryChange={setSkillQuery}
          onSelectedOnlyChange={setSelectedOnly}
          onToggleSkillId={onToggleSkillId}
          open={isSkillSelectorOpen}
          query={skillQuery}
          selectedSkillIds={selectedSkillIds}
          selectedOnly={selectedOnly}
        />

        <div className="flex flex-wrap gap-1.5">
          <Button
            className="h-7 px-2.5 font-mono text-[10px] uppercase tracking-[0.16em]"
            onClick={() => onSelectedJobIdChange(null)}
            size="sm"
            type="button"
            variant="outline"
          >
            Reset Job
          </Button>
          {selectedSkillIds.length > 0 ? (
            <Button
              className="h-7 px-2.5 font-mono text-[10px] uppercase tracking-[0.16em]"
              onClick={onClearSkillIds}
              size="sm"
              type="button"
              variant="outline"
            >
              Clear Skills
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
