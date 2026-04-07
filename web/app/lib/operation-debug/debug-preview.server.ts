import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { getProjectRoot } from "@/lib/get-project-root.server";
import { getMissionDir, getMissionOutputFilePath } from "@/lib/mission-store";
import { loadOperationByRef } from "@/lib/operation-definition/operation-catalog";
import { resolveStepFacets } from "@/lib/operation-definition/facet-loader";
import { readOperationLanguage } from "@/lib/operation-definition/language";
import type {
  OperationDefinition,
  ResolvedFacets,
  StepDefinition,
} from "@/lib/operation-definition/types";
import {
  isAutonomousDelegationStep,
  resolveEffectiveDelegationWorkers,
} from "@/lib/operation-runtime/autonomous";
import {
  createOperationInstantiator,
  type ProcessStepReportResult,
} from "@/lib/operation-runtime/operation-instantiator";
import {
  completeDelegatedTask,
  createOperationState,
  ensureActiveStepTaskId,
  registerDelegatedTask,
} from "@/lib/operation-runtime/state";
import {
  composeTeamMessagePrompt,
  composeUserToNoctisPromptPreview,
  composeWorkerTaskPrompt,
} from "@/lib/prompt-composition-engine";
import {
  buildActivationInstruction,
  buildOperationContextSummary,
  findStepHandoffSource,
} from "@/lib/prompt-composition-engine/operation-prompt-builder";
import { buildTextSection, joinXmlSections } from "@/lib/prompt-composition-engine/prompt-xml";
import type { AgentId, WorkerAgentId, WorkflowNext } from "@/lib/types/mission";

export const PREVIEW_PARTY_MODES = ["full", "solo", "custom"] as const;

export type PreviewPartyMode = (typeof PREVIEW_PARTY_MODES)[number];

export const DEFAULT_PREVIEW_ALLOWED_WORKERS: readonly WorkerAgentId[] = [
  "ignis",
  "gladiolus",
  "prompto",
];

export type PreviewNodeId = "hook1" | "hook2" | "hook3";
export type FlowStepKind = "noctis-step" | "worker-step";
export type FlowNodeKind = "step" | "delegated-dispatch" | "delegated-return";
export type PromptHighlightSource = "user-request" | "handoff" | "task" | "report";

export interface PromptHighlight {
  source: PromptHighlightSource;
  text: string;
  stepName?: string;
  agent?: AgentId | "user";
  taskId?: string;
}

export interface FlowStepPreview {
  id: string;
  nodeKind: FlowNodeKind;
  parentId?: string | null;
  topLevelStepId: string;
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
  promptHighlights: PromptHighlight[];
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
  isSoloLoop?: boolean;
  noFlowExplanation?: string;
}

export interface OperationDebugBundle {
  flowSteps: FlowStepPreview[];
  operation: OperationDefinition;
  reportDir: string;
  previewAllowedWorkers: WorkerAgentId[];
}

const operationInstantiator = createOperationInstantiator();

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

function buildPromptHighlights(input: {
  step: StepDefinition;
  operationState: ReturnType<typeof createOperationState>;
  effectivePrompt: string;
  userMessage: string;
  taskInstruction?: string;
  reportMessage?: string;
  reportAgent?: AgentId;
  reportTaskId?: string;
}): PromptHighlight[] {
  const candidates: PromptHighlight[] = [];

  if (input.step.agent === "noctis" && input.userMessage.trim()) {
    candidates.push({
      source: "user-request",
      text: input.userMessage.trim(),
      agent: "user",
    });
  }

  const handoffSource = findStepHandoffSource({
    stepName: input.step.name,
    operationState: input.operationState,
  });
  if (handoffSource) {
    candidates.push({
      source: "handoff",
      text: handoffSource.summary,
      stepName: handoffSource.step,
      agent: handoffSource.agent,
      taskId: handoffSource.taskId,
    });
  }

  if (input.taskInstruction?.trim()) {
    candidates.push({
      source: "task",
      text: input.taskInstruction.trim(),
    });
  }

  if (input.reportMessage?.trim()) {
    candidates.push({
      source: "report",
      text: input.reportMessage.trim(),
      agent: input.reportAgent,
      taskId: input.reportTaskId,
    });
  }

  return candidates.filter((candidate) =>
    candidate.text.length > 0 && input.effectivePrompt.includes(candidate.text),
  );
}

function buildReportMessage(baseMessage: string): string {
  return baseMessage;
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

function buildSyntheticOutputContent(stepName: string, reportName: string): string {
  if (stepName === "spec-planning" && reportName === "spec-plan.md") {
    return [
      "---",
      "change_name: operation-debug-preview",
      "change_path: openspec/changes/operation-debug-preview",
      "proposal_path: openspec/changes/operation-debug-preview/proposal.md",
      "design_path: openspec/changes/operation-debug-preview/design.md",
      "tasks_path: openspec/changes/operation-debug-preview/tasks.md",
      "---",
      "",
      "# Spec Plan",
      "",
      "Synthetic preview artifact for the spec-planning step.",
      "",
    ].join("\n");
  }

  if (reportName === "code-review.md") {
    return [
      "# Code Review Report",
      "",
      "Synthetic preview artifact for the review step.",
      "",
    ].join("\n");
  }

  return [`# ${reportName}`, "", `Synthetic preview artifact for ${stepName}.`, ""].join("\n");
}

function seedSyntheticOutputs(input: {
  missionId: string;
  step: StepDefinition;
  taskId: string;
}): void {
  for (const report of input.step.output_contracts?.report ?? []) {
    const outputPath = getMissionOutputFilePath(
      input.missionId,
      input.step.name,
      input.taskId,
      report.name,
    );
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, buildSyntheticOutputContent(input.step.name, report.name), "utf-8");
  }
}

function buildRuntimeDecision(input: {
  operation: OperationDefinition;
  step: StepDefinition;
  reportNext: string;
  reportResult: ProcessStepReportResult;
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

function buildNoctisStepGuidance(input: {
  operation: OperationDefinition;
  step: StepDefinition;
  operationState: ReturnType<typeof createOperationState>;
  facets: ResolvedFacets;
  missionId: string;
  allowedWorkersOverride?: readonly WorkerAgentId[];
}): string {
  const taskId = ensureActiveStepTaskId(input.operationState, input.step.agent);
  return buildActivationInstruction({
    operation: input.operation,
    step: input.step,
    operationState: input.operationState,
    facets: input.facets,
    missionId: input.missionId,
    taskId,
    allowedWorkersOverride: input.allowedWorkersOverride,
  });
}

function buildDelegatedReturnGuidance(input: {
  operation: OperationDefinition;
  step: StepDefinition;
  operationState: ReturnType<typeof createOperationState>;
  facets: ResolvedFacets;
  missionId: string;
  allowedWorkersOverride?: readonly WorkerAgentId[];
}): string {
  return joinXmlSections([
    buildTextSection(
      "operation-note",
      `A delegated child task returned to the active "${input.step.name}" step. Integrate the result and decide whether to continue the conversation or delegate again.`,
    ),
    buildNoctisStepGuidance(input),
  ]);
}

export function buildOperationDebugBundle(input: {
  missionId?: string;
  userMessage?: string;
  operationRef: string;
  previewAllowedWorkers?: readonly WorkerAgentId[];
  reportMessage?: string;
  reportNext?: WorkflowNext;
  taskInstruction?: string;
}): OperationDebugBundle {
  const root = getProjectRoot();
  const language = readOperationLanguage();
  const operation = loadOperationByRef(input.operationRef);
  const missionId =
    input.missionId?.trim() ||
    `__operation_preview__${input.operationRef.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  const shouldCleanupSyntheticMission = !input.missionId?.trim();

  const reportNextOverride = input.reportNext?.trim() || "";
  const userMessageBase =
    input.userMessage?.trim() || "This is a synthetic User message for operation activation.";
  const reportMessageBase = input.reportMessage?.trim() || "Synthetic report from worker";
  const previewAllowedWorkers = [
    ...(input.previewAllowedWorkers ?? DEFAULT_PREVIEW_ALLOWED_WORKERS),
  ];

  const flowSteps: FlowStepPreview[] = [];
  const operationState = createOperationState(
    operation.name,
    operation.initial_step,
    input.operationRef,
  );

  const stepOccurrences = new Map<string, number>();
  const maxExecutions = Math.max(operation.steps.length * 4, 12);
  let currentStepName: string | null = operation.initial_step;
  let previousActor: AgentId | "user" = "user";
  let executions = 0;

  try {
    while (currentStepName && executions < maxExecutions) {
      const step = findStep(operation, currentStepName);
      if (!step) {
        break;
      }

      const stepIndex = operation.steps.findIndex((item) => item.name === step.name) + 1;
      const occurrence = (stepOccurrences.get(step.name) ?? 0) + 1;
      stepOccurrences.set(step.name, occurrence);
      const flowStepId = buildFlowId(step.name, occurrence);

      const taskId = ensureActiveStepTaskId(operationState, step.agent);
      const facets = resolveStepFacets(operation, step, language);
      const operationContextSummary = buildOperationContextSummary(operation, operationState);
      const from = displayActorName(previousActor);
      const to = displayActorName(step.agent);
      const pathSummary = `${from} -> Runtime -> ${to}`;
      const reportNext = pickSyntheticNext(step, reportNextOverride);
      const reportMessage = buildReportMessage(reportMessageBase);

      let injectedPrompt = "";
      let effectivePrompt = "";
      let sourceInput = "";
  let promptHighlights: PromptHighlight[] = [];
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
          missionId,
          taskId,
          allowedWorkersOverride: previewAllowedWorkers,
        });
        const composed = composeUserToNoctisPromptPreview({
          context: {
            missionId,
            sessionId: "debug-noctis-session",
            agent: "noctis",
            allowedWorkers: previewAllowedWorkers,
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
        promptHighlights = buildPromptHighlights({
          step,
          operationState,
          effectivePrompt,
          userMessage: userMessageBase,
        });
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
        promptHighlights = buildPromptHighlights({
          step,
          operationState,
          effectivePrompt,
          userMessage: userMessageBase,
          taskInstruction: dispatchPrompt,
        });
        promptTitle = `Runtime -> ${to} Prompt`;
        promptDescription = `Workflow prompt composed for the "${step.name}" step.`;
      }

      if (isAutonomousDelegationStep(step)) {
        const effectiveWorkers = resolveEffectiveDelegationWorkers({
          missionId,
          step,
          allowedWorkersOverride: previewAllowedWorkers,
        });
        const delegatedAgent = effectiveWorkers[0] ?? step.delegation.allowed_workers[0] ?? "gladiolus";
        const parentDecisionSummary = effectiveWorkers.length > 0
          ? `delegate_child_task -> ${displayActorName(delegatedAgent)} (${step.name})`
          : "continue_conversation -> Noctis";
        const parentRuntimeDecision = effectiveWorkers.length > 0
          ? [
              `current_step: ${step.name}`,
              "next_action: delegate_child_task",
              `delegated_agent: ${delegatedAgent}`,
              "current_step_retained: true",
            ].join("\n")
          : [
              `current_step: ${step.name}`,
              "next_action: continue_conversation",
              "current_step_retained: true",
            ].join("\n");

        flowSteps.push({
          id: flowStepId,
          nodeKind: "step",
          parentId: null,
          topLevelStepId: flowStepId,
          stepName: step.name,
          stepIndex,
          occurrence,
          kind,
          title: buildFlowTitle(step.name, occurrence),
          from,
          to,
          pathSummary,
          summary: effectiveWorkers.length > 0
            ? `User activates ${to} for "${step.name}", and Runtime keeps the same step active while Noctis can delegate a child task.`
            : `User activates ${to} for "${step.name}", and the step remains open for continued conversation without delegation.`,
          promptTitle,
          promptDescription,
          sourceInput,
          promptHighlights,
          internalContext,
          suppressedContext,
          injectedPrompt,
          effectivePrompt,
          completionTitle: `${to} Parent Step State`,
          completionDescription: `The parent "${step.name}" step stays open and does not emit a parent-step completion contract.`,
          completionContract: "(parent step remains open; no parent-step completion contract)",
          runtimeDecision: parentRuntimeDecision,
          decisionSummary: parentDecisionSummary,
          operationContextSummary,
          normalizedStep: step,
          resolvedFacets: facets,
          targetAgent: step.agent,
          nextStep: step.name,
          nextAction: effectiveWorkers.length > 0 ? "delegate_child_task" : "continue_conversation",
          nextTarget: effectiveWorkers.length > 0 ? displayActorName(delegatedAgent) : "Noctis",
          hookTrail,
          reportTransport: "",
          workflowGuidance: injectedPrompt,
          isSoloLoop: effectiveWorkers.length === 0,
          noFlowExplanation:
            effectiveWorkers.length === 0
              ? [
                  "Delegation is unavailable because the effective allowed worker set is empty.",
                  "Runtime retains the same autonomous step and continues the conversation with Noctis.",
                ].join(" ")
              : "",
        });

        if (effectiveWorkers.length > 0) {
          const delegatedTaskId = `delegated_${step.name}_${occurrence}`;
          const delegatedPrompt =
            input.taskInstruction?.trim() ||
            `Synthetic child task for ${delegatedAgent}: support the active autonomous Noctis step.`;
          registerDelegatedTask(operationState, {
            parentStep: step.name,
            taskId: delegatedTaskId,
            agent: delegatedAgent,
            message: delegatedPrompt,
          });

          const workerComposed = composeWorkerTaskPrompt({
            context: {
              missionId,
              sessionId: `debug-${delegatedAgent}-session`,
              agent: delegatedAgent,
              appRoot: root,
            },
            missionId,
            agentId: delegatedAgent,
            taskId: delegatedTaskId,
            originalPrompt: delegatedPrompt,
            operationStateOverride: operationState,
          });
          const delegatedNext = reportNextOverride === "ABORT" ? "ABORT" : "COMPLETE";

          flowSteps.push({
            id: `${flowStepId}:delegated-dispatch`,
            nodeKind: "delegated-dispatch",
            parentId: flowStepId,
            topLevelStepId: flowStepId,
            stepName: step.name,
            stepIndex,
            occurrence,
            kind: "worker-step",
            title: `Dispatch to ${displayActorName(delegatedAgent)}`,
            from: "Noctis",
            to: displayActorName(delegatedAgent),
            pathSummary: `Noctis -> Runtime -> ${displayActorName(delegatedAgent)}`,
            summary: "Child task",
            promptTitle: `Runtime -> ${displayActorName(delegatedAgent)} Prompt`,
            promptDescription: `Delegated child-task prompt composed for the active "${step.name}" step.`,
            sourceInput: delegatedPrompt,
            promptHighlights: buildPromptHighlights({
              step,
              operationState,
              effectivePrompt: workerComposed.effectivePrompt,
              userMessage: userMessageBase,
              taskInstruction: delegatedPrompt,
            }),
            internalContext: workerComposed.sharedContext,
            suppressedContext: workerComposed.suppressedContext,
            injectedPrompt: workerComposed.workflowExtension || "(no workflow extension generated)",
            effectivePrompt: workerComposed.effectivePrompt,
            completionTitle: `${displayActorName(delegatedAgent)} -> Runtime Completion Contract`,
            completionDescription: `Default child-task completion contract for the active "${step.name}" step.`,
            completionContract: [
              `scripts/send_report.sh ${missionId} ${delegatedAgent} ${delegatedTaskId} COMPLETE "<message>"`,
              `scripts/send_report.sh ${missionId} ${delegatedAgent} ${delegatedTaskId} ABORT "<message>"`,
            ].join("\n"),
            runtimeDecision: [
              `parent_step: ${step.name}`,
              "next_action: delegate_child_task",
              `delegated_agent: ${delegatedAgent}`,
              "child_task_status: dispatched",
              "current_step_retained: true",
            ].join("\n"),
            decisionSummary: `delegate_child_task -> ${displayActorName(delegatedAgent)} (${step.name})`,
            operationContextSummary,
            normalizedStep: step,
            resolvedFacets: facets,
            targetAgent: delegatedAgent,
            nextStep: step.name,
            nextAction: "await_child_report",
            nextTarget: displayActorName(delegatedAgent),
            hookTrail: ["hook2"],
            reportTransport: "",
            workflowGuidance: "",
          });

          completeDelegatedTask(operationState, {
            taskId: delegatedTaskId,
            status: delegatedNext === "COMPLETE" ? "completed" : "failed",
            summary: reportMessage,
          });

          const delegatedReturnGuidance = buildDelegatedReturnGuidance({
            operation,
            step,
            operationState,
            facets,
            missionId,
            allowedWorkersOverride: previewAllowedWorkers,
          });
          const delegatedReportTransport = buildReportTransport(
            delegatedTaskId,
            delegatedAgent,
            delegatedNext,
            reportMessage,
          );
          const delegatedReturnComposed = composeTeamMessagePrompt({
            context: {
              missionId,
              sessionId: "debug-noctis-session",
              agent: "noctis",
              appRoot: root,
            },
            missionId,
            from: delegatedAgent,
            to: "noctis",
            type: "report",
            body: reportMessage,
            taskId: delegatedTaskId,
            next: delegatedNext,
            workflowExtensionOverride: delegatedReturnGuidance,
            stateTransitionOverride: null,
          });

          flowSteps.push({
            id: `${flowStepId}:delegated-return`,
            nodeKind: "delegated-return",
            parentId: flowStepId,
            topLevelStepId: flowStepId,
            stepName: step.name,
            stepIndex,
            occurrence,
            kind: "noctis-step",
            title: `Return from ${displayActorName(delegatedAgent)}`,
            from: displayActorName(delegatedAgent),
            to: "Noctis",
            pathSummary: `${displayActorName(delegatedAgent)} -> Runtime -> Noctis`,
            summary: "Same step",
            promptTitle: "Runtime -> Noctis Prompt",
            promptDescription: `Delegated child report routed back to Noctis for the active "${step.name}" step.`,
            sourceInput: reportMessage,
            promptHighlights: buildPromptHighlights({
              step,
              operationState,
              effectivePrompt: delegatedReturnComposed.effectivePrompt,
              userMessage: userMessageBase,
              reportMessage,
              reportAgent: delegatedAgent,
              reportTaskId: delegatedTaskId,
            }),
            internalContext: delegatedReturnComposed.sharedContext,
            suppressedContext: delegatedReturnComposed.suppressedContext,
            injectedPrompt: delegatedReturnGuidance,
            effectivePrompt: delegatedReturnComposed.effectivePrompt,
            completionTitle: "Worker -> Runtime Report Transport",
            completionDescription: `Synthetic delegated child report accepted by Runtime before returning control to Noctis.`,
            completionContract: delegatedReportTransport,
            runtimeDecision: [
              `report_next: ${delegatedNext}`,
              `parent_step: ${step.name}`,
              "next_action: return_to_self_step",
              "next_agent: noctis",
              "resolved_next_step: autonomous-step-retained",
            ].join("\n"),
            decisionSummary: `return_to_self_step -> Noctis (${step.name})`,
            ruleEvaluation: [
              `report_next: ${delegatedNext}`,
              "",
              "--- report message ---",
              reportMessage,
            ].join("\n"),
            operationContextSummary,
            normalizedStep: step,
            resolvedFacets: facets,
            targetAgent: "noctis",
            nextStep: step.name,
            nextAction: "return_to_self_step",
            nextTarget: "Noctis",
            hookTrail: ["hook3"],
            reportTransport: delegatedReportTransport,
            workflowGuidance: delegatedReturnGuidance,
          });
        }

        break;
      }

      const completionContract =
        extractXmlSection(effectivePrompt, "step-completion-contract") || "(no completion contract found)";

      const reportResult = operationInstantiator.processStepReport({
        missionId,
        operationState,
        reportBody: reportMessage,
        fromAgent: step.agent,
        taskId,
        next: reportNext,
      });
      seedSyntheticOutputs({ missionId, step, taskId });
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
        id: flowStepId,
        nodeKind: "step",
        parentId: null,
        topLevelStepId: flowStepId,
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
        promptHighlights,
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
  } finally {
    if (shouldCleanupSyntheticMission) {
      rmSync(getMissionDir(missionId), { force: true, recursive: true });
    }
  }

  return {
    flowSteps,
    operation,
    reportDir: operationState.reportDir,
    previewAllowedWorkers,
  };
}
