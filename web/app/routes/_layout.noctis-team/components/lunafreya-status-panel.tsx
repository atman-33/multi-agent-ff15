import { BrainCircuit, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentContextUsage } from "@/lib/types/mission";
import { cn } from "@/lib/utils";
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
};

const NO_JOB_VALUE = "__none__";

const LUNAFREYA_CARD_COPY = {
  name: "Lunafreya",
  role: "Oracle",
} as const;

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
}: LunafreyaStatusPanelProps) {
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
        detail="Facet changes apply on the next User turn."
        imageSrc="/images/lunafreya.png"
        isInParty
        isSpeaking={isSpeaking}
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
          <div className="flex items-center gap-1.5">
            <BrainCircuit className="h-3.5 w-3.5 text-primary/80" />
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
              Knowledge Overlays
            </p>
          </div>

          <ScrollArea className="max-h-48 rounded-lg border border-border/50 bg-background/40">
            <div className="space-y-2 p-2">
              {knowledgeOptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground/75">
                  No knowledge overlays available for the current execution project.
                </div>
              ) : (
                knowledgeOptions.map((option) => {
                  const isSelected = selectedKnowledgeIds.includes(option.id);
                  return (
                    <button
                      key={option.id}
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
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground/80">
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

        <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-xs leading-5 text-muted-foreground/80">
          Overlay edits are stored immediately and will be applied when User sends the next prompt.
        </div>

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
              onClick={() => {
                for (const knowledgeId of selectedKnowledgeIds) {
                  onToggleKnowledgeId(knowledgeId);
                }
              }}
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