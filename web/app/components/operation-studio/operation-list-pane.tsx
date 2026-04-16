import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { OperationOption } from "@/lib/operation-presentation";
import type { OperationStudioDraftRecord } from "@/lib/operation-studio/draft-store";
import { cn } from "@/lib/utils";

interface OperationListPaneProps {
  drafts: OperationStudioDraftRecord[];
  onCreateBlankDraft: () => void;
  onSelectDraft: (draftId: string) => void;
  onSelectOperation: (operationValue: string) => void;
  operations: OperationOption[];
  selectedDraftId: string | null;
  selectedOperation: string;
}

export function OperationListPane({
  drafts,
  onCreateBlankDraft,
  onSelectDraft,
  onSelectOperation,
  operations,
  selectedDraftId,
  selectedOperation,
}: OperationListPaneProps) {
  return (
    <aside className="flex h-full min-w-0 flex-col overflow-hidden border-slate-800/70 border-r bg-slate-900/25 backdrop-blur-sm">
      <div className="flex min-h-16 items-center justify-between gap-3 border-slate-800/70 border-b bg-white/2 px-4">
        <h2 className="font-semibold text-sm text-slate-50">Operations</h2>
        <div className="rounded-full border border-slate-700/70 bg-slate-950/50 px-2.5 py-1 font-mono text-[10px] text-slate-400 uppercase tracking-wide backdrop-blur-sm">
          {operations.length}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:!block [&>div]:!w-full">
        <TooltipProvider delayDuration={150}>
          <nav className="space-y-2 p-3 pr-4">
            <div className="flex items-center justify-between gap-2 pb-1">
              <div className="font-medium text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Draft
              </div>
              <Button onClick={onCreateBlankDraft} size="sm" variant="ghost">
                New Draft
              </Button>
            </div>

            {drafts.length > 0 ? (
              <div className="space-y-2 pb-3">
                {drafts.map((draft) => {
                  const isActive = draft.id === selectedDraftId;
                  return (
                    <button
                      aria-pressed={isActive}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-colors backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
                        isActive
                          ? "border-fuchsia-400/70 bg-fuchsia-500/12 ring-1 ring-fuchsia-400/35"
                          : "border-fuchsia-800/60 bg-fuchsia-950/25 hover:border-fuchsia-700/70 hover:bg-fuchsia-950/35",
                      )}
                      data-draft-id={draft.id}
                      key={draft.id}
                      onClick={() => onSelectDraft(draft.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-sm text-slate-50">
                            {draft.operation.name}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400">
                            {draft.sourceOperationRef ? "Saved revision" : "New draft"}
                          </div>
                        </div>
                        <Badge variant="outline">Draft</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-700/60 bg-slate-950/25 p-3 text-slate-500 text-xs">
                No drafts in this scope and target.
              </div>
            )}

            <div className="pt-2 font-medium text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Saved Operations
            </div>
            {operations.length === 0 ? (
              <div className="rounded-lg border border-slate-700/70 bg-slate-950/45 p-3 text-slate-400 text-sm backdrop-blur-sm">
                No operations are available for this authoring target.
              </div>
            ) : (
              operations.map((operation) => {
                const isActive = !selectedDraftId && operation.value === selectedOperation;
                const button = (
                  <button
                    aria-pressed={isActive}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left transition-colors backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
                      isActive
                        ? "border-blue-400/70 bg-blue-500/12 ring-1 ring-blue-400/35 shadow-[0_10px_30px_rgba(37,99,235,0.14)]"
                        : "border-slate-700/70 bg-slate-950/40 hover:border-slate-600/80 hover:bg-slate-900/55",
                    )}
                    data-operation-value={operation.value}
                    onClick={() => onSelectOperation(operation.value)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-sm text-slate-50">
                          {operation.label}
                        </div>
                      </div>
                      {operation.isDefault ? <Badge variant="outline">Default</Badge> : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                      <Badge variant="outline">{operation.sourceLabel}</Badge>
                      {operation.projectId ? (
                        <span className="font-mono text-slate-500">{operation.projectId}</span>
                      ) : null}
                    </div>
                  </button>
                );

                if (!operation.description) {
                  return <div key={operation.value}>{button}</div>;
                }

                return (
                  <Tooltip key={operation.value}>
                    <TooltipTrigger asChild>{button}</TooltipTrigger>
                    <TooltipContent side="right" className="max-w-80 text-xs leading-relaxed">
                      {operation.description}
                    </TooltipContent>
                  </Tooltip>
                );
              })
            )}
          </nav>
        </TooltipProvider>
      </ScrollArea>
    </aside>
  );
}