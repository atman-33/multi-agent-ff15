import { AlertCircle, FileText, RefreshCw, Tag, Workflow } from "lucide-react";
import { useMemo } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getLunafreyaJobDisplayLabel } from "@/lib/lunafreya-prompt-context";
import type { MissionOutputSummary } from "@/lib/types/mission";
import { cn } from "@/lib/utils";

type MissionOutputBrowserProps = {
  outputs: MissionOutputSummary[];
  currentStep: string | null;
  isLoadingOutputs: boolean;
  outputsError: string | null;
  selectedOutput: MissionOutputSummary | null;
  onReload: () => void;
  onSelectOutput: (output: MissionOutputSummary) => void;
};

type OutputTaskGroup = {
  taskId: string;
  latestDate: string;
  outputs: MissionOutputSummary[];
};

type OutputStepGroup = {
  step: string;
  isCurrent: boolean;
  latestDate: string;
  tasks: OutputTaskGroup[];
};

export function getMissionOutputKey(output: Pick<MissionOutputSummary, "step" | "taskId" | "filename">): string {
  return `${output.step}::${output.taskId}::${output.filename}`;
}

export function pickPreferredMissionOutput(
  outputs: MissionOutputSummary[],
  currentStep: string | null,
): MissionOutputSummary | null {
  if (outputs.length === 0) {
    return null;
  }

  if (currentStep) {
    const currentStepOutput = outputs.find((output) => output.step === currentStep);
    if (currentStepOutput) {
      return currentStepOutput;
    }
  }

  return outputs[0] ?? null;
}

function buildOutputGroups(
  outputs: MissionOutputSummary[],
  currentStep: string | null,
): OutputStepGroup[] {
  const stepGroups = new Map<string, Map<string, MissionOutputSummary[]>>();

  for (const output of outputs) {
    if (!stepGroups.has(output.step)) {
      stepGroups.set(output.step, new Map());
    }

    const taskGroups = stepGroups.get(output.step);
    if (!taskGroups) {
      continue;
    }

    if (!taskGroups.has(output.taskId)) {
      taskGroups.set(output.taskId, []);
    }

    taskGroups.get(output.taskId)?.push(output);
  }

  return Array.from(stepGroups.entries())
    .map(([step, tasks]) => {
      const taskGroups = Array.from(tasks.entries())
        .map(([taskId, taskOutputs]) => {
          const sortedOutputs = [...taskOutputs].sort(
            (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
          );

          return {
            taskId,
            latestDate: sortedOutputs[0]?.date ?? "",
            outputs: sortedOutputs,
          } satisfies OutputTaskGroup;
        })
        .sort((left, right) => new Date(right.latestDate).getTime() - new Date(left.latestDate).getTime());

      return {
        step,
        isCurrent: step === currentStep,
        latestDate: taskGroups[0]?.latestDate ?? "",
        tasks: taskGroups,
      } satisfies OutputStepGroup;
    })
    .sort((left, right) => {
      if (left.isCurrent && !right.isCurrent) {
        return -1;
      }
      if (!left.isCurrent && right.isCurrent) {
        return 1;
      }
      return new Date(right.latestDate).getTime() - new Date(left.latestDate).getTime();
    });
}

export function MissionOutputBrowser({
  outputs,
  currentStep,
  isLoadingOutputs,
  outputsError,
  selectedOutput,
  onReload,
  onSelectOutput,
}: MissionOutputBrowserProps) {
  const groupedOutputs = useMemo(() => buildOutputGroups(outputs, currentStep), [currentStep, outputs]);
  const selectedOutputKey = selectedOutput ? getMissionOutputKey(selectedOutput) : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-border/50 border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary/80" />
          <div>
            <h3 className="font-semibold text-sm">Outputs</h3>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/60">
              Mission artifacts
            </p>
          </div>
          <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {outputs.length}
          </span>
        </div>
        <Button
          aria-label="Reload mission outputs"
          className="h-7 w-7"
          disabled={isLoadingOutputs}
          onClick={onReload}
          size="icon"
          variant="ghost"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoadingOutputs && "animate-spin")} />
        </Button>
      </div>

      {outputsError ? (
        <div className="p-3">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Unable to load outputs</AlertTitle>
            <AlertDescription>{outputsError}</AlertDescription>
          </Alert>
        </div>
      ) : isLoadingOutputs ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-muted-foreground text-sm">
          Loading mission outputs...
        </div>
      ) : outputs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center">
          <div className="space-y-2 rounded-xl border border-border/50 bg-card/40 px-4 py-6">
            <p className="font-semibold text-sm">No outputs yet</p>
            <p className="text-muted-foreground text-xs leading-5">
              This mission has not generated any workflow output files yet.
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-3">
            {groupedOutputs.map((stepGroup) => (
              <section className="space-y-2" key={stepGroup.step}>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/80">
                    <Workflow className="h-3 w-3" />
                    {stepGroup.step}
                  </span>
                  {stepGroup.isCurrent ? (
                    <span className="rounded-full bg-primary/12 px-2 py-0.5 font-medium text-[10px] text-primary uppercase tracking-widest">
                      Current step
                    </span>
                  ) : null}
                </div>

                {stepGroup.tasks.map((taskGroup) => (
                  <div className="space-y-1.5" key={`${stepGroup.step}:${taskGroup.taskId}`}>
                    <div className="flex items-center gap-1.5 px-1 text-muted-foreground text-[11px]">
                      <Tag className="h-3 w-3" />
                      <span className="font-mono">{taskGroup.taskId}</span>
                    </div>

                    {taskGroup.outputs.map((output) => {
                      const outputKey = getMissionOutputKey(output);
                      const isSelected = outputKey === selectedOutputKey;

                      return (
                        <button
                          className={cn(
                            "w-full rounded-xl border p-3 text-left transition-colors",
                            isSelected
                              ? "border-primary/40 bg-primary/10"
                              : "border-border/50 bg-card/40 hover:bg-card/70",
                          )}
                          key={outputKey}
                          onClick={() => onSelectOutput(output)}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-sm">
                                {output.title || output.filename}
                              </p>
                              <p className="truncate font-mono text-[10px] text-muted-foreground/70">
                                {output.filename}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                              {new Date(output.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                          {output.metadata?.lunafreyaFacetSnapshot ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] text-primary/90">
                                Job: {getLunafreyaJobDisplayLabel(output.metadata.lunafreyaFacetSnapshot)}
                              </span>
                              {output.metadata.lunafreyaFacetSnapshot.selectedKnowledgeLabels.length > 0 ? (
                                output.metadata.lunafreyaFacetSnapshot.selectedKnowledgeLabels.map((label) => (
                                  <span
                                    key={`${outputKey}:${label}`}
                                    className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] text-foreground/80"
                                  >
                                    {label}
                                  </span>
                                ))
                              ) : (
                                <span className="rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground/80">
                                  Knowledge: none
                                </span>
                              )}
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </ScrollArea>
      )}

    </div>
  );
}