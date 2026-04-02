import { getProjectRoot } from "@/lib/get-project-root.server";
import { resolveStepFacets } from "@/lib/operation-definition/facet-loader";
import { readOperationLanguage } from "@/lib/operation-definition/language";
import { loadOperationByName } from "@/lib/operation-definition/operation-loader";
import type {
  OperationDefinition,
  ResolvedFacets,
  StepDefinition,
} from "@/lib/operation-definition/types";
import { processReport } from "@/lib/operation-runtime/runtime";
import { createOperationState, ensureActiveStepTaskId } from "@/lib/operation-runtime/state";
import {
  composeUserToNoctisPromptPreview,
  composeWorkerTaskPrompt,
} from "@/lib/prompt-composition-engine";
import {
  buildActivationInstruction,
  buildOperationContextSummary,
} from "@/lib/prompt-composition-engine/operation-prompt-builder";
import type { AgentId, WorkerAgentId, WorkflowNext } from "@/lib/types/mission";

export type PreviewNodeId = "hook1" | "hook2" | "hook3";
export type FlowStepKind = "noctis-step" | "worker-step";

export interface FlowStepPreview {
  id: string;
  stepName: string;
  stepIndex: number;
  occurrence: number;
  kind: FlowStepKind;
  title: string;
  from: string;
  to: string;
  pathSummary: string;
  summary: string;
  promptTitle: string;
  promptDescription: string;
  sourceInput: string;
  internalContext: string;
  suppressedContext?: string | null;
  injectedPrompt: string;
  effectivePrompt: string;
  completionTitle: string;
  completionDescription: string;
  completionContract: string;
  runtimeDecision: string;
  decisionSummary: string;
  ruleEvaluation?: string;
  operationContextSummary: string;
  normalizedStep: StepDefinition;
  resolvedFacets?: ResolvedFacets;
  targetAgent?: AgentId;
  nextStep?: string | null;
  nextAction?: string | null;
  nextTarget?: string | null;
  hookTrail: PreviewNodeId[];
  reportTransport: string;
  workflowGuidance: string;
}

export interface OperationDebugBundle {
  flowSteps: FlowStepPreview[];
  operation: OperationDefinition;
  reportDir: string;
}

function toWorkerAgent(agent: string): WorkerAgentId {
  return agent === "ignis" || agent === "gladiolus" || agent === "prompto"
    ? agent
    : "gladiolus";
}

function findStep(operation: OperationDefinition, stepName: string): StepDefinition | undefined {
  return operation.steps.find((step) => step.name === stepName);
}

function displayActorName(actor: AgentId | "user" | "COMPLETE" | "ABORT"): string {
  switch (actor) {
    case "user":
      return "User";
    case "noctis":
      return "Noctis";
    case "ignis":
      return "Ignis";
    case "gladiolus":
      return "Gladiolus";
    case "prompto":
      return "Prompto";
    default:
      return actor;
  }
}

function buildFlowId(stepName: string, occurrence: number): string {
  return `${stepName}:step:${occurrence}`;
}

function buildFlowTitle(stepName: string, occurrence: number): string {
  return occurrence > 1 ? `${stepName} #${occurrence}` : stepName;
}

function buildReportMessage(baseMessage: string, stepName: string): string {
  return `${baseMessage}\n\n[step:${stepName}]`;
}

function pickSyntheticNext(step: StepDefinition, override?: string): string {
  const normalizedOverride = override?.trim();
  if (normalizedOverride && step.rules.some((rule) => rule.next === normalizedOverride)) {
    return normalizedOverride;
  }

  return step.rules[0]?.next ?? "COMPLETE";
}

function extractXmlSection(document: string, tagName: string): string {
  const match = document.match(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`));
  return match?.[0]?.trim() ?? "";
}

function buildReportTransport(taskId: string, agent: AgentId, next: string, reportMessage: string): string {
  return [
    `agent: ${agent}`,
    `task_id: ${taskId}`,
    `next: ${next}`,
    "message:",
    reportMessage,
  ].join("\n");
}

function buildRuntimeDecision(input: {
  operation: OperationDefinition;
  step: StepDefinition;
  reportNext: string;
  reportResult: ReturnType<typeof processReport>;
}): {
  runtimeDecision: string;
  decisionSummary: string;
  nextStep: string | null;
  nextAction: string | null;
  nextTarget: string | null;
} {
  const { operation, step, reportNext, reportResult } = input;
  const nextStepName = reportResult.stateTransition?.nextStep ?? null;
  const nextStep =
    nextStepName && nextStepName !== "COMPLETE" && nextStepName !== "ABORT"
      ? findStep(operation, nextStepName)
      : undefined;

  let nextAction: string | null = null;
  let nextTarget: string | null = null;
  let decisionSummary = "No transition detected";

  if (reportResult.nextWorkerDispatch) {
    nextAction = "dispatch_worker";
    nextTarget = displayActorName(reportResult.nextWorkerDispatch.agentId);
    decisionSummary = `${nextAction} -> ${nextTarget} (${reportResult.nextWorkerDispatch.step})`;
  } else if (nextStep?.agent === "noctis") {
    nextAction = "begin_self_step";
    nextTarget = "Noctis";
    decisionSummary = `${nextAction} -> ${nextTarget} (${nextStep.name})`;
  } else if (nextStepName === "COMPLETE" || nextStepName === "ABORT") {
    nextAction = "report_to_user";
    nextTarget = nextStepName;
    decisionSummary = `${nextAction} -> ${nextTarget}`;
  } else if (nextStep) {
    nextAction = "review_transition";
    nextTarget = displayActorName(nextStep.agent);
    decisionSummary = `${nextAction} -> ${nextTarget} (${nextStep.name})`;
  }

  const lines = [
    `report_next: ${reportNext}`,
    `completed_step: ${step.name}`,
    `completed_by: ${displayActorName(step.agent)}`,
    `resolved_next_step: ${nextStepName ?? "(none)"}`,
    `next_action: ${nextAction ?? "(none)"}`,
  ];

  if (reportResult.stateTransition) {
    lines.push(`matched_rule_condition: ${JSON.stringify(reportResult.stateTransition.ruleCondition)}`);
  }

  if (reportResult.nextWorkerDispatch) {
    lines.push(`next_agent: ${reportResult.nextWorkerDispatch.agentId}`);
    lines.push(`dispatch_step: ${reportResult.nextWorkerDispatch.step}`);
  } else if (nextStep?.agent === "noctis") {
    lines.push("next_agent: noctis");
    lines.push(`activate_step: ${nextStep.name}`);
  } else if (nextStepName === "COMPLETE" || nextStepName === "ABORT") {
    lines.push(`terminal: ${nextStepName}`);
  }

  return {
    runtimeDecision: lines.join("\n"),
    decisionSummary,
    nextStep: nextStepName,
    nextAction,
    nextTarget,
  };
}

function buildStepSummary(stepName: string, from: string, to: string, decisionSummary: string): string {
  return `${from} completed the previous handoff, Runtime activates ${to} for "${stepName}", and the synthetic report resolves as ${decisionSummary}.`;
}

export function buildOperationDebugBundle(input: {
  missionId?: string;
  userMessage?: string;
  operationName: string;
  previousResponse?: string;
  reportMessage?: string;
  reportNext?: WorkflowNext;
  taskInstruction?: string;
}): OperationDebugBundle {
  const root = getProjectRoot();
  const language = readOperationLanguage();
  const operation = loadOperationByName(input.operationName, language);
  const missionId = input.missionId?.trim() || "debug-mission";

  const reportNextOverride = input.reportNext?.trim() || "";
  const userMessageBase =
    input.userMessage?.trim() || "This is a synthetic User message for operation activation.";
  const reportMessageBase = input.reportMessage?.trim() || "Synthetic report from worker";
  const previousStepOutputBase = input.previousResponse?.trim() || "Synthetic previous step output";

  const flowSteps: FlowStepPreview[] = [];
  const operationState = createOperationState(operation.name, operation.initial_step);
  operationState.previousResponse = previousStepOutputBase;

  const stepOccurrences = new Map<string, number>();
  const maxExecutions = Math.max(operation.steps.length * 4, 12);
  let currentStepName: string | null = operation.initial_step;
  let previousActor: AgentId | "user" = "user";
  let executions = 0;

  while (currentStepName && executions < maxExecutions) {
    const step = findStep(operation, currentStepName);
    if (!step) {
      break;
    }

    const stepIndex = operation.steps.findIndex((item) => item.name === step.name) + 1;
    const occurrence = (stepOccurrences.get(step.name) ?? 0) + 1;
    stepOccurrences.set(step.name, occurrence);

    const taskId = ensureActiveStepTaskId(operationState, step.agent);
    const facets = resolveStepFacets(operation, step, language);
    const operationContextSummary = buildOperationContextSummary(operation, operationState);
    const from = displayActorName(previousActor);
    const to = displayActorName(step.agent);
    const pathSummary = `${from} -> Runtime -> ${to}`;
    const reportNext = pickSyntheticNext(step, reportNextOverride);
    const reportMessage = buildReportMessage(reportMessageBase, step.name);

    let injectedPrompt = "";
    let effectivePrompt = "";
    let sourceInput = "";
    let internalContext = "";
    let suppressedContext: string | null | undefined;
    let promptTitle = "";
    let promptDescription = "";
    let kind: FlowStepKind = "worker-step";
    let hookTrail: PreviewNodeId[] = ["hook2", "hook3"];

    if (step.agent === "noctis") {
      kind = "noctis-step";
      hookTrail = ["hook1", "hook3"];
      injectedPrompt = buildActivationInstruction({
        operation,
        step,
        operationState,
        facets,
        reportDir: operationState.reportDir,
        missionId,
        taskId,
      });
      const composed = composeUserToNoctisPromptPreview({
        context: {
          missionId,
          sessionId: "debug-noctis-session",
          agent: "noctis",
          allowedWorkers: ["ignis", "gladiolus", "prompto"],
          appRoot: root,
          executionMode: "operation-debug",
        },
        workflowExtension: injectedPrompt,
        userMessage: userMessageBase,
      });

      sourceInput = composed.promptBody;
      internalContext = composed.sharedContext;
      suppressedContext = composed.suppressedContext;
      effectivePrompt = composed.effectivePrompt ?? injectedPrompt;
      promptTitle = "Runtime -> Noctis Prompt";
      promptDescription = "Activation prompt reconstructed from the current workflow state and user input.";
    } else {
      const workerAgent = toWorkerAgent(step.agent);
      const dispatchPrompt =
        input.taskInstruction?.trim() ||
        `Synthetic task for ${workerAgent}: implement the current step as Noctis instructed.`;
      const dispatchComposed = composeWorkerTaskPrompt({
        context: {
          missionId,
          sessionId: `debug-${workerAgent}-session`,
          agent: workerAgent,
          appRoot: root,
        },
        missionId,
        agentId: workerAgent,
        taskId,
        originalPrompt: dispatchPrompt,
        operationStateOverride: operationState,
      });

      sourceInput = dispatchPrompt;
      internalContext = dispatchComposed.sharedContext;
      suppressedContext = dispatchComposed.suppressedContext;
      injectedPrompt = dispatchComposed.workflowExtension || "(no workflow extension generated)";
      effectivePrompt = dispatchComposed.effectivePrompt ?? injectedPrompt;
      promptTitle = `Runtime -> ${to} Prompt`;
      promptDescription = `Workflow prompt composed for the "${step.name}" step.`;
    }

    const completionContract =
      extractXmlSection(effectivePrompt, "step-completion-contract") || "(no completion contract found)";

    const reportResult = processReport({
      missionId,
      operationState,
      reportBody: reportMessage,
      fromAgent: step.agent,
      taskId,
      next: reportNext,
    });
    const runtimeDecision = buildRuntimeDecision({
      operation,
      step,
      reportNext,
      reportResult,
    });
    const workflowGuidance = reportResult.noctisGuidance || "";
    const ruleEvaluation = [
      runtimeDecision.runtimeDecision,
      "",
      "--- report message ---",
      reportMessage,
    ].join("\n");

    flowSteps.push({
      id: buildFlowId(step.name, occurrence),
      stepName: step.name,
      stepIndex,
      occurrence,
      kind,
      title: buildFlowTitle(step.name, occurrence),
      from,
      to,
      pathSummary,
      summary: buildStepSummary(step.name, from, to, runtimeDecision.decisionSummary),
      promptTitle,
      promptDescription,
      sourceInput,
      internalContext,
      suppressedContext,
      injectedPrompt,
      effectivePrompt,
      completionTitle: `${to} -> Runtime Completion Contract`,
      completionDescription: `Allowed outcomes and report transport for the "${step.name}" step.`,
      completionContract,
      runtimeDecision: runtimeDecision.runtimeDecision,
      decisionSummary: runtimeDecision.decisionSummary,
      ruleEvaluation,
      operationContextSummary,
      normalizedStep: step,
      resolvedFacets: facets,
      targetAgent: step.agent,
      nextStep: runtimeDecision.nextStep,
      nextAction: runtimeDecision.nextAction,
      nextTarget: runtimeDecision.nextTarget,
      hookTrail,
      reportTransport: buildReportTransport(taskId, step.agent, reportNext, reportMessage),
      workflowGuidance,
    });

    const nextStepName = runtimeDecision.nextStep;
    currentStepName =
      nextStepName && nextStepName !== "COMPLETE" && nextStepName !== "ABORT"
        ? operationState.currentStep
        : null;
    previousActor = step.agent;
    executions += 1;
  }

  return {
    flowSteps,
    operation,
    reportDir: operationState.reportDir,
  };
}
