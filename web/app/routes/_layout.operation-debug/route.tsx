import { ArrowDown, Bug, RefreshCw, Send, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { PageContainer } from "@/components/page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { readOperationLanguage } from "@/lib/operation-definition/language";
import { listAvailableOperations } from "@/lib/operation-definition/operation-loader";
import { buildOperationDebugBundle } from "@/lib/prompt-composition-engine/debug-preview.server";
import { cn } from "@/lib/utils";
import { CopyablePromptBlock } from "./components/copyable-prompt-block";
import type { Route } from "./+types/route";

type LoaderData = {
  activeStepId: string;
  userMessage: string;
  operations: string[];
  preview: ReturnType<typeof buildOperationDebugBundle> | null;
  selectedOperation: string | null;
  taskInstruction: string;
};

type PreviewStep = NonNullable<LoaderData["preview"]>["flowSteps"][number];

function getLanguage(): string {
  return readOperationLanguage();
}

function formatNextLabel(step?: PreviewStep | null): string {
  if (!step) {
    return "Next: -";
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

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const language = getLanguage();
  const operations = listAvailableOperations(language).sort((left, right) => left.localeCompare(right));
  const requestedOperation = url.searchParams.get("operation")?.trim() || null;
  const selectedOperation =
    requestedOperation && operations.includes(requestedOperation)
      ? requestedOperation
      : (operations[0] ?? null);

  const taskInstruction =
    url.searchParams.get("task")?.trim() || "Execute the current step according to the workflow context.";
  const userMessage =
    url.searchParams.get("userMessage")?.trim() || "This is a synthetic User message for operation activation.";

  const preview =
    selectedOperation
      ? buildOperationDebugBundle({
          userMessage,
          operationName: selectedOperation,
          taskInstruction,
        })
      : null;

  const activeStepParam = url.searchParams.get("step")?.trim() || null;
  const activeStepId =
    activeStepParam && preview?.flowSteps.some((step) => step.id === activeStepParam)
      ? activeStepParam
      : (preview?.flowSteps[0]?.id ?? "");

  return {
    activeStepId,
    userMessage,
    operations,
    selectedOperation,
    taskInstruction,
    preview,
  } satisfies LoaderData;
};

const OperationDebugPage = ({ loaderData }: Route.ComponentProps) => {
  const navigate = useNavigate();
  const [selectedOperation, setSelectedOperation] = useState(loaderData.selectedOperation ?? "");
  const [activeStepId, setActiveStepId] = useState(loaderData.activeStepId);
  const [userMessage, setUserMessage] = useState(loaderData.userMessage);
  const [taskInstruction, setTaskInstruction] = useState(loaderData.taskInstruction);

  useEffect(() => {
    setSelectedOperation(loaderData.selectedOperation ?? "");
    setActiveStepId(loaderData.activeStepId);
    setUserMessage(loaderData.userMessage);
    setTaskInstruction(loaderData.taskInstruction);
  }, [loaderData]);

  const navigateWithPreviewParams = ({
    userInput,
    operation,
    stepId,
    task,
  }: {
    userInput: string;
    operation: string;
    stepId: string;
    task: string;
  }) => {
    const params = new URLSearchParams();
    if (operation) {
      params.set("operation", operation);
    }
    if (stepId) {
      params.set("step", stepId);
    }
    if (userInput.trim()) {
      params.set("userMessage", userInput.trim());
    }
    if (task.trim()) {
      params.set("task", task.trim());
    }
    void navigate(`/operation-debug?${params.toString()}`);
  };

  const handleGenerate = () => {
    navigateWithPreviewParams({
      userInput: userMessage,
      operation: selectedOperation,
      stepId: activeStepId,
      task: taskInstruction,
    });
  };

  const handleReset = () => {
    const operation = loaderData.operations[0] ?? "";
    setSelectedOperation(operation);
    setActiveStepId("");
    setUserMessage("This is a synthetic User message for operation activation.");
    setTaskInstruction("Execute the current step according to the workflow context.");
    void navigate("/operation-debug");
  };

  const bundle = loaderData.preview;
  const selectedStep = useMemo(
    () => bundle?.flowSteps.find((step) => step.id === activeStepId) ?? bundle?.flowSteps[0] ?? null,
    [bundle, activeStepId],
  );

  const selectedStepNumber = useMemo(() => {
    if (!bundle?.flowSteps.length || !selectedStep) {
      return null;
    }

    const index = bundle.flowSteps.findIndex((step) => step.id === selectedStep.id);
    return index >= 0 ? index + 1 : null;
  }, [bundle, selectedStep]);

  const facetStats = useMemo(() => {
    if (!selectedStep?.resolvedFacets) {
      return [] as Array<{ label: string; value: string }>;
    }

    return [
      { label: "Job", value: selectedStep.resolvedFacets.job ? "loaded" : "missing" },
      {
        label: "Instruction",
        value: selectedStep.resolvedFacets.instruction ? "loaded" : "missing",
      },
      {
        label: "Knowledge",
        value:
          selectedStep.resolvedFacets.knowledge.length > 0
            ? `${selectedStep.resolvedFacets.knowledge.length} loaded`
            : "missing",
      },
      {
        label: "Policy",
        value:
          selectedStep.resolvedFacets.policies.length > 0
            ? `${selectedStep.resolvedFacets.policies.length} loaded`
            : "missing",
      },
      {
        label: "Output Contract",
        value:
          selectedStep.resolvedFacets.outputContracts.length > 0
            ? `${selectedStep.resolvedFacets.outputContracts.length} loaded`
            : "missing",
      },
    ];
  }, [selectedStep]);

  const finalPrompt = useMemo(() => {
    if (!selectedStep) {
      return "No preview available.";
    }

    return selectedStep.effectivePrompt ?? selectedStep.injectedPrompt;
  }, [selectedStep]);

  const completionContract = useMemo(() => {
    if (!selectedStep) {
      return "No completion contract available.";
    }

    return selectedStep.completionContract || "No completion contract available.";
  }, [selectedStep]);

  const runtimeDecision = useMemo(() => {
    if (!selectedStep) {
      return "No runtime decision available.";
    }

    return selectedStep.runtimeDecision || "No runtime decision available.";
  }, [selectedStep]);

  const advancedBlocks = useMemo(() => {
    if (!selectedStep) {
      return [] as Array<{ id: string; title: string; description: string; content: string }>;
    }

    const blocks: Array<{ id: string; title: string; description: string; content: string }> = [
      {
        id: "internal",
        title: "Internal Context",
        description: "Shared context injected before the workflow-specific prompt.",
        content: selectedStep.internalContext,
      },
      {
        id: "step-context",
        title: "Step Context",
        description: "Synthetic operation state summary for this step execution.",
        content: selectedStep.operationContextSummary ?? "No context available.",
      },
      {
        id: "source",
        title: "Prompt Source Input",
        description: "Raw input used to build the runtime -> agent prompt.",
        content: selectedStep.sourceInput,
      },
      {
        id: "transport",
        title: "Synthetic Report Transport",
        description: "Transport payload sent from the current agent back to Runtime.",
        content: selectedStep.reportTransport,
      },
      {
        id: "hooks",
        title: "Hook Metadata",
        description: "Low-level hook stages involved in this step.",
        content: selectedStep.hookTrail.join(" -> "),
      },
    ];

    if (selectedStep.workflowGuidance?.trim()) {
      blocks.push({
        id: "guidance",
        title: "Workflow Guidance",
        description: "Raw runtime guidance generated after the synthetic report.",
        content: selectedStep.workflowGuidance,
      });
    }

    if (selectedStep.ruleEvaluation?.trim()) {
      blocks.push({
        id: "rule",
        title: "Rule Evaluation",
        description: "Expanded decision trace for the synthetic report.",
        content: selectedStep.ruleEvaluation,
      });
    }

    if (selectedStep.suppressedContext?.trim()) {
      blocks.push({
        id: "suppressed",
        title: "Suppressed Metadata",
        description: "Debug-only metadata kept outside the agent-visible prompt.",
        content: selectedStep.suppressedContext,
      });
    }

    return blocks;
  }, [selectedStep]);

  const flowToneClass = (kind: string, selected: boolean) => {
    if (selected) {
      return "border-blue-400 bg-blue-950/80 shadow-lg ring-2 ring-blue-400/60";
    }

    if (kind === "noctis-step") {
      return "border-sky-950 bg-sky-950/20 opacity-60 hover:border-sky-800 hover:bg-sky-950/35 hover:opacity-80";
    }

    return "border-amber-950 bg-amber-950/20 opacity-60 hover:border-amber-800 hover:bg-amber-950/35 hover:opacity-80";
  };

  return (
    <PageContainer className="max-w-none gap-4 overflow-hidden bg-slate-950 px-4 text-slate-100" size="wide">
      <div className="border-border/50 border-b pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="gap-1.5 text-white" variant="default">
                <Bug className="h-3.5 w-3.5" />
                Operation Debug
              </Badge>
              {selectedStepNumber ? <Badge variant="outline">Step {selectedStepNumber}</Badge> : null}
            </div>
            <p className="max-w-4xl text-slate-300 text-sm">
              Reachable runtime-mediated steps are generated from the selected operation YAML.
              Select a step to inspect the injected prompt, completion contract, runtime decision, and low-level debug details.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleReset} size="sm" variant="outline">
              <RefreshCw className="h-4 w-4" />
              Reset
            </Button>
            <Button className="" onClick={handleGenerate} size="sm">
              <Wrench className="h-4 w-4" />
              Regenerate
            </Button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[30rem_minmax(0,1fr)]">
        <Card className="flex h-full min-h-0 flex-col overflow-hidden border-slate-800 bg-slate-900 text-slate-100">
          <CardHeader className="border-b border-slate-800 bg-slate-900">
            <CardTitle className="text-lg">Flow</CardTitle>
            <CardDescription className="text-slate-400">
              Runtime-mediated step flow for the currently reachable path.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex flex-1 flex-col gap-4 overflow-hidden">
            <div className="space-y-2">
              <label className="font-medium text-sm" htmlFor="operation-select">
                Operation
              </label>
              <Select
                onValueChange={(value) => {
                  setSelectedOperation(value);
                  navigateWithPreviewParams({
                    userInput: userMessage,
                    operation: value,
                    stepId: "",
                    task: taskInstruction,
                  });
                }}
                value={selectedOperation}
              >
                <SelectTrigger className="border-slate-700 bg-slate-950 text-slate-100 data-placeholder:text-slate-500" id="operation-select">
                  <SelectValue placeholder="Select an operation" />
                </SelectTrigger>
                <SelectContent className="border-slate-700 bg-slate-900 text-slate-100">
                  {loaderData.operations.map((operation) => (
                    <SelectItem className="text-slate-100 focus:bg-slate-800 focus:text-slate-100" key={operation} value={operation}>
                      {operation}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Tabs className="min-h-0 flex flex-1 flex-col" defaultValue="flow">
              <TabsList className="w-full justify-start border-slate-800" variant="line">
                <TabsTrigger className="" value="flow" variant="line">
                  Flow
                </TabsTrigger>
                <TabsTrigger className="" value="inputs" variant="line">
                  Inputs
                </TabsTrigger>
              </TabsList>

              <TabsContent className="min-h-0 flex-1 overflow-auto pr-1" value="flow">
                <div className="space-y-2">
                  {(bundle?.flowSteps ?? []).map((step, index, arr) => {
                    const selected = step.id === selectedStep?.id;
                    const stepNumber = index + 1;
                    return (
                      <div key={step.id}>
                        <button
                          className={cn(
                            "w-full cursor-pointer rounded-lg border p-3 text-left transition-all",
                            flowToneClass(step.kind, selected),
                          )}
                          onClick={() => {
                            setActiveStepId(step.id);
                            navigateWithPreviewParams({
                              userInput: userMessage,
                              operation: selectedOperation,
                              stepId: step.id,
                              task: taskInstruction,
                            });
                          }}
                          type="button"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold",
                                  selected
                                    ? "border-blue-300 bg-blue-500 text-white"
                                    : "border-slate-700 bg-slate-950/90 text-slate-400",
                                )}
                              >
                                {stepNumber}
                              </div>
                              <div className={cn("font-semibold text-sm", selected ? "text-slate-50" : "text-slate-300")}>
                                {step.title}
                              </div>
                            </div>
                          </div>
                          <div className={cn("mt-1 flex items-center gap-2 text-xs", selected ? "text-slate-200" : "text-slate-500")}>
                            <Send className="h-3 w-3" />
                            {step.pathSummary}
                          </div>
                          <div className={cn("mt-2 font-medium text-xs", selected ? "text-blue-100" : "text-slate-300")}>
                            {formatNextLabel(step)}
                          </div>
                        </button>

                        {index < arr.length - 1 ? (
                          <div className="flex justify-center py-2">
                            <ArrowDown className="h-4 w-4 text-slate-600" />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent className="min-h-0 flex-1 space-y-4 overflow-auto pr-1" value="inputs">
                <div className="space-y-2 rounded-lg border border-blue-800 bg-blue-950/40 p-3 text-slate-100">
                  <label className="font-medium text-sm" htmlFor="user-message">
                    User Message
                  </label>
                  <Textarea
                    id="user-message"
                    onChange={(event) => setUserMessage(event.target.value)}
                    rows={4}
                    value={userMessage}
                  />
                </div>

                <div className="space-y-2 rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-slate-100">
                  <label className="font-medium text-sm" htmlFor="task-instruction">
                    Worker Task Seed
                  </label>
                  <Textarea
                    id="task-instruction"
                    onChange={(event) => setTaskInstruction(event.target.value)}
                    rows={4}
                    value={taskInstruction}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="min-h-0 space-y-4 overflow-auto pr-1">
          <Card className="border-slate-800 bg-slate-900 text-slate-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Selected Step</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 font-semibold text-sm text-white">
                      {selectedStepNumber ?? "-"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-base text-slate-50">{selectedStep?.title ?? "-"}</div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <div className="font-mono text-slate-500">{selectedStep?.id ?? "-"}</div>
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Send className="h-3.5 w-3.5 shrink-0" />
                          <span>{selectedStep?.pathSummary ?? "-"}</span>
                        </div>
                        <div className="font-medium text-blue-100">
                          {formatNextLabel(selectedStep)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900 text-slate-100">
            <CardHeader>
              <CardTitle className="text-lg">Step Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="prompt">
                <TabsList className="w-full justify-start border-slate-800" variant="line">
                  <TabsTrigger className="" value="prompt" variant="line">
                    Prompt
                  </TabsTrigger>
                  <TabsTrigger className="" value="contract" variant="line">
                    Contract
                  </TabsTrigger>
                  <TabsTrigger className="" value="decision" variant="line">
                    Decision
                  </TabsTrigger>
                  <TabsTrigger className="" value="advanced" variant="line">
                    Advanced
                  </TabsTrigger>
                </TabsList>

                <TabsContent className="space-y-4" value="prompt">
                  <CopyablePromptBlock
                    className="border-blue-900 bg-blue-950/30"
                    description={selectedStep?.promptDescription ?? ""}
                    highlightTexts={selectedStep?.sourceInput ? [selectedStep.sourceInput] : []}
                    preClassName="max-h-136"
                    title={selectedStep?.promptTitle ?? "Prompt"}
                    value={finalPrompt}
                  />
                </TabsContent>

                <TabsContent className="space-y-3" value="contract">
                  <CopyablePromptBlock
                    preClassName="max-h-136"
                    title={selectedStep?.completionTitle ?? "Completion Contract"}
                    description={selectedStep?.completionDescription ?? ""}
                    value={completionContract}
                  />
                </TabsContent>

                <TabsContent className="space-y-4" value="decision">
                  <CopyablePromptBlock
                    className="border-emerald-900 bg-emerald-950/20"
                    preClassName="max-h-136"
                    title="Runtime Decision"
                    description="How Runtime interprets the synthetic report for this step."
                    value={runtimeDecision}
                  />

                  {selectedStep?.workflowGuidance?.trim() ? (
                    <CopyablePromptBlock
                      preClassName="max-h-136"
                      title="Workflow Guidance"
                      description="Raw runtime guidance generated after the synthetic report."
                      value={selectedStep.workflowGuidance}
                    />
                  ) : null}
                </TabsContent>

                <TabsContent className="space-y-4" value="advanced">
                  <div className="grid gap-3 md:grid-cols-5">
                    {facetStats.map((stat) => (
                      <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-slate-100" key={stat.label}>
                        <div className="text-slate-400 text-xs uppercase tracking-wide">{stat.label}</div>
                        <div className="mt-1 font-medium text-sm">{stat.value}</div>
                      </div>
                    ))}
                  </div>

                  {advancedBlocks.map((block) => (
                    <CopyablePromptBlock
                      key={block.id}
                      preClassName="max-h-64"
                      title={block.title}
                      description={block.description}
                      value={block.content}
                    />
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
};

export default OperationDebugPage;
