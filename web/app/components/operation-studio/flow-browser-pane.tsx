import { ArrowDown, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FlowStepPreview } from "@/lib/operation-debug/debug-preview.server";
import { cn } from "@/lib/utils";

interface FlowGroup {
  parent: FlowStepPreview;
  children: FlowStepPreview[];
}

interface FlowBrowserPaneProps {
  flowGroups: FlowGroup[];
  onSelectStep: (stepId: string) => void;
  selectedStepId: string | null;
}

function formatNextLabel(step?: FlowStepPreview | null): string {
  if (!step) {
    return "Next: -";
  }

  if (step.isSoloLoop) {
    return "Loop: Continue with Noctis";
  }

  if (step.nodeKind === "delegated-dispatch" && step.nextTarget) {
    return `Awaiting report: ${step.nextTarget}`;
  }

  if (step.nodeKind === "delegated-return" && step.nextStep && step.nextTarget) {
    return `Returns: ${step.nextStep} by ${step.nextTarget}`;
  }

  if (step.nextAction === "delegate_child_task" && step.nextTarget) {
    return `Delegates: ${step.nextTarget}`;
  }

  if (step.nextTarget === "COMPLETE") {
    return "Complete";
  }

  if (step.nextTarget === "ABORT") {
    return "Abort";
  }

  if (step.nextStep && step.nextTarget) {
    return `Next: ${step.nextStep} by ${step.nextTarget}`;
  }

  if (step.nextStep) {
    return `Next: ${step.nextStep}`;
  }

  return "Next: -";
}

function flowToneClass(step: FlowStepPreview, selected: boolean) {
  if (selected) {
    return "border-blue-400/70 bg-blue-500/14 shadow-[0_12px_32px_rgba(59,130,246,0.16)] ring-1 ring-blue-400/35";
  }

  if (step.isSoloLoop) {
    return "border-teal-700/35 bg-teal-500/8 hover:border-teal-600/45 hover:bg-teal-500/12";
  }

  if (step.kind === "noctis-step") {
    return "border-sky-700/25 bg-sky-500/8 hover:border-sky-600/35 hover:bg-sky-500/12";
  }

  return "border-amber-700/25 bg-amber-500/8 hover:border-amber-600/35 hover:bg-amber-500/12";
}

export function FlowBrowserPane({
  flowGroups,
  onSelectStep,
  selectedStepId,
}: FlowBrowserPaneProps) {
  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden border-slate-800/70 border-r bg-slate-900/20 backdrop-blur-sm">
      <div className="flex min-h-16 items-center border-slate-800/70 border-b bg-white/2 px-4">
        <h2 className="font-semibold text-sm text-slate-50">Flow</h2>
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:!block [&>div]:!w-full">
        <div className="space-y-4 p-4 pr-5">
          {flowGroups.length === 0 ? (
            <div className="rounded-lg border border-slate-700/70 bg-slate-950/45 p-4 text-slate-400 text-sm backdrop-blur-sm">
              Select an operation to inspect its reachable flow.
            </div>
          ) : (
            flowGroups.map((group, index, arr) => {
              const step = group.parent;
              const selected = step.id === selectedStepId;
              const stepNumber = index + 1;
              return (
                <div key={step.id}>
                  <div className="space-y-2">
                    <button
                      className={cn(
                        "w-full cursor-pointer rounded-lg border p-3 text-left transition-all backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
                        flowToneClass(step, selected),
                      )}
                      onClick={() => onSelectStep(step.id)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold",
                              selected
                                ? "border-blue-300/80 bg-blue-500/85 text-white"
                                : "border-slate-700/80 bg-slate-950/60 text-slate-400",
                            )}
                          >
                            {stepNumber}
                          </div>
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                "font-semibold text-sm",
                                selected ? "text-slate-50" : "text-slate-300",
                              )}
                            >
                              {step.title}
                            </div>
                            {step.isSoloLoop ? <Badge variant="outline">Solo Loop</Badge> : null}
                          </div>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "mt-1 flex items-center gap-2 text-xs",
                          selected ? "text-slate-200" : "text-slate-500",
                        )}
                      >
                        <Send className="h-3 w-3" />
                        {step.pathSummary}
                      </div>
                      <div
                        className={cn(
                          "mt-2 font-medium text-xs",
                          selected ? "text-blue-100" : "text-slate-300",
                        )}
                      >
                        {formatNextLabel(step)}
                      </div>
                    </button>

                    {group.children.length > 0 ? (
                      <div className="ml-5 space-y-2 border-slate-700/60 border-l pl-4">
                        {group.children.map((child) => {
                          const childSelected = child.id === selectedStepId;
                          return (
                            <button
                              className={cn(
                                "w-full cursor-pointer rounded-lg border p-3 text-left transition-all backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
                                flowToneClass(child, childSelected),
                              )}
                              key={child.id}
                              onClick={() => onSelectStep(child.id)}
                              type="button"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 flex-col gap-1">
                                  <div
                                    className={cn(
                                      "font-semibold text-sm",
                                      childSelected ? "text-slate-50" : "text-slate-300",
                                    )}
                                  >
                                    {child.title}
                                  </div>
                                  {child.summary ? (
                                    <div
                                      className={cn(
                                        "text-[11px] font-medium tracking-wide",
                                        childSelected ? "text-blue-100" : "text-slate-400",
                                      )}
                                    >
                                      {child.summary}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <div
                                className={cn(
                                  "mt-2 flex items-center gap-2 text-xs",
                                  childSelected ? "text-slate-200" : "text-slate-500",
                                )}
                              >
                                <Send className="h-3 w-3" />
                                {child.pathSummary}
                              </div>
                              <div
                                className={cn(
                                  "mt-2 font-medium text-xs",
                                  childSelected ? "text-blue-100" : "text-slate-300",
                                )}
                              >
                                {formatNextLabel(child)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  {index < arr.length - 1 ? (
                    <div className="flex justify-center py-2">
                      <ArrowDown className="h-4 w-4 text-slate-600" />
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </section>
  );
}