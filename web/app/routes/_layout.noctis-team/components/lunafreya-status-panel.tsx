import { BrainCircuit, Cpu, Info, Layers3, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CompactModelVariantPicker } from "@/components/compact-model-variant-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { AgentContextUsage } from "@/lib/types/mission";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import type { AgentStatus } from "./character-card";
import { CharacterCard } from "./character-card";

export type LunafreyaFacetOption = {
  id: string;
  label: string;
  description: string | null;
  sourceKind: "builtin" | "project";
  sourceLabel: string;
};

type LunafreyaStatusPanelProps = {
  contextUsage?: AgentContextUsage | null;
  status: AgentStatus;
  isSpeaking?: boolean;
  selectedJobId: string | null;
  selectedKnowledgeIds: string[];
  jobOptions: LunafreyaFacetOption[];
  knowledgeOptions: LunafreyaFacetOption[];
  onSelectedJobIdChange: (jobId: string | null) => void;
  onToggleKnowledgeId: (knowledgeId: string) => void;
  onClearKnowledgeIds: () => void;
};

const NO_JOB_VALUE = "__none__";

const LUNAFREYA_CARD_COPY = {
  name: "Lunafreya",
  role: "Oracle",
} as const;

export function getSelectedKnowledgeOptions(
  knowledgeOptions: LunafreyaFacetOption[],
  selectedKnowledgeIds: string[],
): LunafreyaFacetOption[] {
  const optionsById = new Map(knowledgeOptions.map((option) => [option.id, option]));

  return selectedKnowledgeIds.flatMap((knowledgeId) => {
    const option = optionsById.get(knowledgeId);
    return option ? [option] : [];
  });
}

export function filterKnowledgeOptions(input: {
  knowledgeOptions: LunafreyaFacetOption[];
  selectedKnowledgeIds: string[];
  query: string;
  selectedOnly: boolean;
}): LunafreyaFacetOption[] {
  const normalizedQuery = input.query.trim().toLowerCase();

  return input.knowledgeOptions.filter((option) => {
    if (input.selectedOnly && !input.selectedKnowledgeIds.includes(option.id)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return option.label.toLowerCase().includes(normalizedQuery);
  });
}

type LunafreyaKnowledgeSelectorDialogProps = {
  open: boolean;
  knowledgeOptions: LunafreyaFacetOption[];
  selectedKnowledgeIds: string[];
  query: string;
  selectedOnly: boolean;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelectedOnlyChange: (selectedOnly: boolean) => void;
  onToggleKnowledgeId: (knowledgeId: string) => void;
  onClearKnowledgeIds: () => void;
};

export function LunafreyaKnowledgeSelectorDialog({
  open,
  knowledgeOptions,
  selectedKnowledgeIds,
  query,
  selectedOnly,
  onOpenChange,
  onQueryChange,
  onSelectedOnlyChange,
  onToggleKnowledgeId,
  onClearKnowledgeIds,
}: LunafreyaKnowledgeSelectorDialogProps) {
  const filteredKnowledgeOptions = useMemo(
    () =>
      filterKnowledgeOptions({
        knowledgeOptions,
        selectedKnowledgeIds,
        query,
        selectedOnly,
      }),
    [knowledgeOptions, query, selectedKnowledgeIds, selectedOnly],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] overflow-hidden p-0 sm:max-h-[min(85vh,48rem)] sm:max-w-2xl">
        <DialogHeader className="border-border/50 border-b px-4 pt-4 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <DialogTitle>Manage Knowledge Overlays</DialogTitle>
              <DialogDescription>
                Search available knowledge, review descriptions, and update Lunafreya&#39;s next-turn knowledge set.
              </DialogDescription>
            </div>
            <Badge className="rounded-full font-mono text-[10px] uppercase tracking-[0.16em]" variant="outline">
              {`${selectedKnowledgeIds.length} selected`}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-3 px-4 pt-3 pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                aria-label="Search knowledge overlays"
                className="pl-9"
                onChange={(event) => onQueryChange(event.currentTarget.value)}
                placeholder="Search knowledge by name"
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
            <p>{`${filteredKnowledgeOptions.length} results`}</p>
            {selectedKnowledgeIds.length > 0 ? (
              <Button
                className="h-7 px-2.5 font-mono text-[10px] uppercase tracking-[0.16em]"
                onClick={onClearKnowledgeIds}
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
              {knowledgeOptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground/75">
                  No knowledge overlays available for the current execution project.
                </div>
              ) : filteredKnowledgeOptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground/75">
                  No knowledge overlays match the current filter.
                </div>
              ) : (
                filteredKnowledgeOptions.map((option) => {
                  const isSelected = selectedKnowledgeIds.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      aria-pressed={isSelected}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                        isSelected
                          ? "border-primary/40 bg-primary/10"
                          : "border-border/50 bg-card/40 hover:bg-card/70",
                      )}
                      onClick={() => onToggleKnowledgeId(option.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-sm text-foreground/90">{option.label}</p>
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
                        <p className="mt-1 text-xs leading-5 text-muted-foreground/80">{option.description}</p>
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
  status,
  isSpeaking = false,
  selectedJobId,
  selectedKnowledgeIds,
  jobOptions,
  knowledgeOptions,
  onSelectedJobIdChange,
  onToggleKnowledgeId,
  onClearKnowledgeIds,
}: LunafreyaStatusPanelProps) {
  const [providers, setProviders] = useState<OpencodeProvider[]>([]);
  const [variantsByModel, setVariantsByModel] = useState<Record<string, string[]>>({});
  const [isKnowledgeSelectorOpen, setIsKnowledgeSelectorOpen] = useState(false);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
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

  const modelItems = useMemo<ModelCatalogItem[]>(() => flattenProviderModels(providers), [providers]);
  const selectedKnowledgeOptions = useMemo(
    () => getSelectedKnowledgeOptions(knowledgeOptions, selectedKnowledgeIds),
    [knowledgeOptions, selectedKnowledgeIds],
  );

  useEffect(() => {
    if (isKnowledgeSelectorOpen) {
      return;
    }

    setKnowledgeQuery("");
    setSelectedOnly(false);
  }, [isKnowledgeSelectorOpen]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2 border-border/50 border-b pb-2">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Lunafreya Status
        </span>
      </div>

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

      <div className="space-y-3 rounded-xl border border-border/50 bg-card/40 p-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Layers3 className="h-3.5 w-3.5 text-primary/80" />
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              Job Overlay
            </p>
          </div>
          <Select
            value={selectedJobId ?? NO_JOB_VALUE}
            onValueChange={(value) => onSelectedJobIdChange(value === NO_JOB_VALUE ? null : value)}
          >
            <SelectTrigger className="h-9 bg-background/70 text-sm">
              <SelectValue placeholder="Select a job overlay" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_JOB_VALUE}>No job overlay</SelectItem>
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
                Knowledge Overlays
              </p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Knowledge overlays help"
                    className="h-4 w-4 rounded-full border border-border/50 p-0 font-mono text-[10px] text-muted-foreground/80"
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Info className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-72 text-xs leading-relaxed">
                  Knowledge overlay changes are stored immediately and apply on Lunafreya&#39;s next User turn.
                </TooltipContent>
              </Tooltip>
            </div>
            {knowledgeOptions.length > 0 ? (
              <Button
                aria-label="Open knowledge selector"
                className="h-7 w-7 rounded-full"
                onClick={() => setIsKnowledgeSelectorOpen(true)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>

          <div className="space-y-2 rounded-lg border border-border/50 bg-background/40 px-3 py-3">
            {knowledgeOptions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground/75">
                No knowledge overlays available for the current execution project.
              </div>
            ) : selectedKnowledgeOptions.length > 0 ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                    {`${selectedKnowledgeOptions.length} selected`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedKnowledgeOptions.map((option) => (
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
                <p className="text-sm text-foreground/85">No knowledge overlays selected.</p>
                <p className="text-xs text-muted-foreground/75">
                  Use the selector to browse the catalog and activate the knowledge Lunafreya should use on the next User turn.
                </p>
              </div>
            )}
          </div>
        </div>

        <LunafreyaKnowledgeSelectorDialog
          knowledgeOptions={knowledgeOptions}
          onClearKnowledgeIds={onClearKnowledgeIds}
          onOpenChange={setIsKnowledgeSelectorOpen}
          onQueryChange={setKnowledgeQuery}
          onSelectedOnlyChange={setSelectedOnly}
          onToggleKnowledgeId={onToggleKnowledgeId}
          open={isKnowledgeSelectorOpen}
          query={knowledgeQuery}
          selectedKnowledgeIds={selectedKnowledgeIds}
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
            Clear Job
          </Button>
          {selectedKnowledgeIds.length > 0 ? (
            <Button
              className="h-7 px-2.5 font-mono text-[10px] uppercase tracking-[0.16em]"
              onClick={onClearKnowledgeIds}
              size="sm"
              type="button"
              variant="outline"
            >
              Clear Knowledge
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}