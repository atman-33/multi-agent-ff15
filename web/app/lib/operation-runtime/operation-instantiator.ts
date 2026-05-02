import { readOperationLanguage } from "@/lib/operation-definition/language";
import { isWorkerAgentId } from "@/lib/agent-identity";
import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  findUnambiguousUserFacingOperationEntryForMessage,
  loadOperationByRef,
} from "@/lib/operation-definition/operation-catalog";
import {
  resolveDelegatedWorkerFacets,
  resolveStepFacets,
} from "@/lib/operation-definition/facet-loader";
import type {
  OperationDefinition,
  ResolvedFacets,
  StepDefinition,
} from "@/lib/operation-definition/types";
import {
  buildActivationInstruction,
  buildAugmentedInstruction,
  buildDelegatedWorkerInstruction,
  buildOperationContextSummary,
  describeStepRole,
  validateStepPromptPlaceholders,
} from "@/lib/prompt-composition-engine/operation-prompt-builder";
import {
  buildTextSection,
  buildYamlSection,
  joinXmlSections,
} from "@/lib/prompt-composition-engine/prompt-xml";
import { resolveSelectedSharedSkills } from "@/lib/shared-skills.server";
import {
  completeDelegatedTask,
  createOperationState,
  ensureActiveStepTaskId,
  getDelegatedTaskRecord,
  getOperationRef,
  getOperationState,
  recordStepCompleted,
  saveOperationState,
} from "./state";
import { hasDelegationPolicy } from "./autonomous";
import { checkAgentDeviation } from "./deviation-tracker";
import { evaluateNextStep } from "./rule-evaluator";
import type { OperationState, StateTransition } from "./types";
import type { AgentId, WorkerAgentId, WorkflowNext } from "@/lib/types/mission";

export type OperationPromptMode = "activation" | "worker" | "delegated-worker";

export interface OperationPromptArtifact {
  mode: OperationPromptMode;
  promptText: string;
  operation: OperationDefinition;
  operationState: OperationState;
  step: StepDefinition;
  facets: ResolvedFacets;
  deviationNote: string | null;
}

export interface ActivateOperationInput {
  missionId: string;
  message: string;
  selectedOperation?: string | null;
  operationOverride?: OperationDefinition | null;
  allowReuseActiveOperation?: boolean;
  allowedWorkersOverride?: readonly WorkerAgentId[];
}

export interface ActivateOperationResult {
  activationText: string | null;
  additionalContext: string | null;
  operationActivated?: string;
  stateTransition?: StateTransition;
  operation: OperationDefinition | null;
  operationState: OperationState | null;
  step: StepDefinition | null;
  promptArtifact: OperationPromptArtifact | null;
}

export interface OperationInstantiator {
  activateOperation(input: ActivateOperationInput): ActivateOperationResult;
  augmentTaskPrompt(input: AugmentTaskPromptInput): AugmentTaskPromptResult;
  processStepReport(input: ProcessStepReportInput): ProcessStepReportResult;
}

export interface AugmentTaskPromptInput {
  missionId: string;
  originalPrompt: string;
  agentId: WorkerAgentId;
  taskId: string;
  operationState?: OperationState;
  operationOverride?: OperationDefinition | null;
}

export interface AugmentTaskPromptResult {
  promptText: string;
  usedOperationPrompt: boolean;
  operation: OperationDefinition | null;
  operationState: OperationState | null;
  step: StepDefinition | null;
  promptArtifact: OperationPromptArtifact | null;
}

export interface ProcessStepReportInput {
  missionId: string;
  reportBody: string;
  fromAgent: AgentId;
  taskId: string;
  next?: WorkflowNext;
  operationState?: OperationState;
  operationOverride?: OperationDefinition | null;
  allowedWorkersOverride?: readonly WorkerAgentId[];
}

export interface ProcessStepReportResult {
  noctisGuidance: string;
  stateTransition: StateTransition | null;
  nextWorkerDispatch: { step: string; agentId: WorkerAgentId } | null;
  operation: OperationDefinition | null;
  operationState: OperationState | null;
  currentStep: StepDefinition | null;
  nextStep: StepDefinition | null;
  promptArtifact: OperationPromptArtifact | null;
}

function listPreferredBuiltinLanguages(language: string): string[] {
  return language === "en" ? ["en"] : [language, "en"];
}

function detectOperationRef(message: string): string | null {
  const language = readOperationLanguage();
  return (
    findUnambiguousUserFacingOperationEntryForMessage({
      builtinLanguages: listPreferredBuiltinLanguages(language),
      message,
      scope: "noctis_team",
    })?.ref ?? null
  );
}

function loadOperationForState(state: OperationState): OperationDefinition {
  return loadOperationByRef(getOperationRef(state));
}

function resolveOperationForInput(input: {
  operationOverride?: OperationDefinition | null;
  operationState: OperationState;
}): OperationDefinition {
  return input.operationOverride ?? loadOperationForState(input.operationState);
}

function buildActivationArtifact(input: {
  missionId: string;
  operation: OperationDefinition;
  operationState: OperationState;
  step: StepDefinition;
  allowedWorkersOverride?: readonly WorkerAgentId[];
}): OperationPromptArtifact {
  const language = readOperationLanguage();
  const taskId = ensureActiveStepTaskId(input.operationState, input.step.agent);
  const facets = resolveStepFacets(input.operation, input.step, language);
  const sharedSkillEntries =
    input.step.agent === "lunafreya"
      ? []
      : resolveSelectedSharedSkills(getProjectRoot()).validEntries;

  validateStepPromptPlaceholders({
    operation: input.operation,
    operationState: input.operationState,
    missionId: input.missionId,
    step: input.step,
  });

  const promptText = buildActivationInstruction({
    operation: input.operation,
    step: input.step,
    operationState: input.operationState,
    facets,
    missionId: input.missionId,
    taskId,
    allowedWorkersOverride: input.allowedWorkersOverride,
    sharedSkillEntries,
  });

  return {
    mode: "activation",
    promptText,
    operation: input.operation,
    operationState: input.operationState,
    step: input.step,
    facets,
    deviationNote: null,
  };
}

function buildWorkerPromptArtifact(input: {
  missionId: string;
  originalPrompt: string;
  agentId: WorkerAgentId;
  taskId: string;
  operation: OperationDefinition;
  operationState: OperationState;
  step: StepDefinition;
}): OperationPromptArtifact {
  const language = readOperationLanguage();
  const delegatedTask = getDelegatedTaskRecord(input.operationState, input.taskId);
  const sharedSkillEntries = resolveSelectedSharedSkills(getProjectRoot()).validEntries;

  if (
    delegatedTask &&
    hasDelegationPolicy(input.step) &&
    delegatedTask.parentStep === input.step.name
  ) {
    const deviationNote = checkAgentDeviation(
      input.operationState,
      delegatedTask.agent,
      input.agentId,
    );
    const facets = resolveDelegatedWorkerFacets(input.operation, input.step, language);
    const basePrompt = buildDelegatedWorkerInstruction({
      taskPrompt: input.originalPrompt,
      step: input.step,
      agentId: input.agentId,
      operation: input.operation,
      operationState: input.operationState,
      facets,
      missionId: input.missionId,
      sharedSkillEntries,
    });
    const promptText = deviationNote
      ? joinXmlSections([basePrompt, buildTextSection("deviation-note", deviationNote)])
      : basePrompt;

    return {
      mode: "delegated-worker",
      promptText,
      operation: input.operation,
      operationState: input.operationState,
      step: input.step,
      facets,
      deviationNote,
    };
  }

  const deviationNote = checkAgentDeviation(
    input.operationState,
    input.step.agent,
    input.agentId,
  );
  const facets = resolveStepFacets(input.operation, input.step, language);
  const basePrompt = buildAugmentedInstruction({
    step: input.step,
    operation: input.operation,
    operationState: input.operationState,
    facets,
    missionId: input.missionId,
    agentId: input.agentId,
    taskId: input.taskId,
    sharedSkillEntries,
  });
  const promptText = deviationNote
    ? joinXmlSections([basePrompt, buildTextSection("deviation-note", deviationNote)])
    : basePrompt;

  return {
    mode: "worker",
    promptText,
    operation: input.operation,
    operationState: input.operationState,
    step: input.step,
    facets,
    deviationNote,
  };
}

function buildTransitionGuidance(
  operation: OperationDefinition,
  transition: StateTransition,
): string {
  const nextStep = operation.steps.find((step) => step.name === transition.nextStep);
  const nextAction =
    nextStep && !isWorkerAgentId(nextStep.agent)
      ? "begin_self_step"
      : nextStep
        ? "dispatch_worker"
        : "review_transition";
  const lines = [
    `operation: ${operation.name}`,
    `completed_step: ${transition.previousStep}`,
    `matched_rule_condition: ${JSON.stringify(transition.ruleCondition)}`,
    `next_step: ${transition.nextStep}`,
    `next_action: ${nextAction}`,
  ];

  if (nextStep) {
    lines.push(`next_agent: ${nextStep.agent}`);
    const nextJob = describeStepRole(nextStep.job, nextStep.name);
    if (nextJob) {
      lines.push(`next_job: ${nextJob}`);
    }
  }

  return joinXmlSections([
    buildYamlSection("step-transition", lines.join("\n")),
    nextStep
      ? buildTextSection(
          "next-action",
          !isWorkerAgentId(nextStep.agent)
            ? `Begin the "${nextStep.name}" step yourself.`
            : `Runtime will dispatch ${nextStep.agent} for the "${nextStep.name}" step.`,
        )
      : null,
  ]);
}

function buildTerminalGuidance(
  operation: OperationDefinition,
  state: OperationState,
  terminal: "COMPLETE" | "ABORT",
): string {
  const lines = [
    `operation: ${operation.name}`,
    `final_step: ${state.currentStep}`,
    `status: ${terminal.toLowerCase()}`,
    "next_action: report_to_user",
  ];

  return joinXmlSections([
    buildYamlSection("operation-terminal-status", lines.join("\n")),
    buildTextSection(
      "next-action",
      terminal === "COMPLETE"
        ? "Report final results to User."
        : "Report the situation to User with relevant context.",
    ),
  ]);
}

function buildDelegatedReturnGuidance(input: {
  step: StepDefinition;
  promptArtifact: OperationPromptArtifact;
}): string {
  return joinXmlSections([
    buildTextSection(
      "operation-note",
      `A delegated child task returned to the active "${input.step.name}" step. Integrate the result and decide whether to continue the conversation or delegate again.`,
    ),
    input.promptArtifact.promptText,
  ]);
}

function cloneOperationState(state: OperationState): OperationState {
  return {
    ...state,
    stepHistory: state.stepHistory.map((entry) => ({ ...entry })),
    delegatedTasks: state.delegatedTasks.map((entry) => ({ ...entry })),
    deviations: {
      ...state.deviations,
      history: state.deviations.history.map((entry) => ({ ...entry })),
    },
  };
}

export function createOperationInstantiator(): OperationInstantiator {
  return {
    activateOperation(input) {
      const existingState = getOperationState(input.missionId);

      if (existingState) {
        const operation = resolveOperationForInput({
          operationOverride: input.operationOverride,
          operationState: existingState,
        });
        const currentStep = operation.steps.find(
          (step) => step.name === existingState.currentStep,
        ) ?? null;

        if (currentStep && !isWorkerAgentId(currentStep.agent) && input.allowReuseActiveOperation !== false) {
          const promptArtifact = buildActivationArtifact({
            missionId: input.missionId,
            operation,
            operationState: existingState,
            step: currentStep,
            allowedWorkersOverride: input.allowedWorkersOverride,
          });
          saveOperationState(input.missionId, existingState);

          return {
            activationText: promptArtifact.promptText,
            additionalContext: promptArtifact.promptText,
            operation,
            operationState: existingState,
            step: currentStep,
            promptArtifact,
          };
        }

        const activationText = currentStep
          ? buildOperationContextSummary(operation, existingState)
          : null;

        return {
          activationText,
          additionalContext: activationText,
          operation,
          operationState: existingState,
          step: currentStep,
          promptArtifact: null,
        };
      }

      const operationRef = Object.hasOwn(input, "selectedOperation")
        ? input.selectedOperation?.trim() || null
        : detectOperationRef(input.message);
      if (!operationRef && !input.operationOverride) {
        return {
          activationText: null,
          additionalContext: null,
          operation: null,
          operationState: null,
          step: null,
          promptArtifact: null,
        };
      }

      const operation = input.operationOverride ?? (operationRef ? loadOperationByRef(operationRef) : null);
      if (!operation) {
        return {
          activationText: null,
          additionalContext: null,
          operation: null,
          operationState: null,
          step: null,
          promptArtifact: null,
        };
      }
      const operationState = createOperationState(
        operation.name,
        operation.initial_step,
        operationRef ?? `draft:${operation.name}`,
      );
      const step = operation.steps.find((candidate) => candidate.name === operation.initial_step) ?? null;

      let promptArtifact: OperationPromptArtifact | null = null;
      let activationText: string | null = null;

      if (step && !isWorkerAgentId(step.agent)) {
        promptArtifact = buildActivationArtifact({
          missionId: input.missionId,
          operation,
          operationState,
          step,
          allowedWorkersOverride: input.allowedWorkersOverride,
        });
        activationText = promptArtifact.promptText;
      } else {
        activationText = buildOperationContextSummary(operation, operationState);
      }

      saveOperationState(input.missionId, operationState);

      return {
        activationText,
        additionalContext: activationText,
        operationActivated: operation.name,
        operation,
        operationState,
        step,
        promptArtifact,
      };
    },

    augmentTaskPrompt(input) {
      const operationState = input.operationState ?? getOperationState(input.missionId) ?? null;

      if (
        !operationState ||
        (operationState.status !== "running" && operationState.status !== "waiting_for_report")
      ) {
        return {
          promptText: input.originalPrompt,
          usedOperationPrompt: false,
          operation: null,
          operationState,
          step: null,
          promptArtifact: null,
        };
      }

      const operation = resolveOperationForInput({
        operationOverride: input.operationOverride,
        operationState,
      });
      const step = operation.steps.find((candidate) => candidate.name === operationState.currentStep) ?? null;

      if (!step) {
        return {
          promptText: input.originalPrompt,
          usedOperationPrompt: false,
          operation,
          operationState,
          step: null,
          promptArtifact: null,
        };
      }

      const promptArtifact = buildWorkerPromptArtifact({
        missionId: input.missionId,
        originalPrompt: input.originalPrompt,
        agentId: input.agentId,
        taskId: input.taskId,
        operation,
        operationState,
        step,
      });

      if (!input.operationState) {
        saveOperationState(input.missionId, operationState);
      }

      return {
        promptText: promptArtifact.promptText,
        usedOperationPrompt: true,
        operation,
        operationState,
        step,
        promptArtifact,
      };
    },

    processStepReport(input) {
      const persistedOperationState = input.operationState ?? getOperationState(input.missionId) ?? null;

      if (
        !persistedOperationState ||
        (persistedOperationState.status !== "running" &&
          persistedOperationState.status !== "waiting_for_report")
      ) {
        return {
          noctisGuidance: "",
          stateTransition: null,
          nextWorkerDispatch: null,
          operation: null,
          operationState: persistedOperationState,
          currentStep: null,
          nextStep: null,
          promptArtifact: null,
        };
      }

      const operationState = cloneOperationState(persistedOperationState);

      const operation = resolveOperationForInput({
        operationOverride: input.operationOverride,
        operationState,
      });
      const currentStep = operation.steps.find(
        (step) => step.name === operationState.currentStep,
      ) ?? null;

      if (!currentStep || currentStep.rules.length === 0) {
        const delegatedTask = currentStep
          ? getDelegatedTaskRecord(operationState, input.taskId)
          : undefined;

        if (
          currentStep &&
          !isWorkerAgentId(currentStep.agent) &&
          hasDelegationPolicy(currentStep) &&
          delegatedTask &&
          delegatedTask.parentStep === currentStep.name
        ) {
          completeDelegatedTask(operationState, {
            taskId: input.taskId,
            status: input.next === "ABORT" ? "failed" : "completed",
            summary: input.reportBody,
          });

          const promptArtifact = buildActivationArtifact({
            missionId: input.missionId,
            operation,
            operationState,
            step: currentStep,
            allowedWorkersOverride: input.allowedWorkersOverride,
          });

          if (!input.operationState) {
            saveOperationState(input.missionId, operationState);
          }

          return {
            noctisGuidance: buildDelegatedReturnGuidance({
              step: currentStep,
              promptArtifact,
            }),
            stateTransition: null,
            nextWorkerDispatch: null,
            operation,
            operationState,
            currentStep,
            nextStep: currentStep,
            promptArtifact,
          };
        }

        return {
          noctisGuidance: "",
          stateTransition: null,
          nextWorkerDispatch: null,
          operation,
          operationState,
          currentStep,
          nextStep: null,
          promptArtifact: null,
        };
      }

      const ruleMatch =
        typeof input.next === "string" && input.next.trim()
          ? evaluateNextStep(input.next, currentStep.rules)
          : null;

      if (!ruleMatch) {
        return {
          noctisGuidance: buildTextSection(
            "operation-note",
            "Could not determine the next step from the step report. Missing or invalid next.",
          ),
          stateTransition: null,
          nextWorkerDispatch: null,
          operation,
          operationState,
          currentStep,
          nextStep: null,
          promptArtifact: null,
        };
      }

      const stateTransition: StateTransition = {
        previousStep: operationState.currentStep,
        nextStep: ruleMatch.next,
        ruleMatched: ruleMatch.matchedIndex,
        ruleCondition: ruleMatch.condition,
      };

      recordStepCompleted(operationState, stateTransition, input.reportBody.slice(0, 500));

      if (ruleMatch.next === "COMPLETE" || ruleMatch.next === "ABORT") {
        if (!input.operationState) {
          saveOperationState(input.missionId, operationState);
        }

        return {
          noctisGuidance: buildTerminalGuidance(operation, operationState, ruleMatch.next),
          stateTransition,
          nextWorkerDispatch: null,
          operation,
          operationState,
          currentStep,
          nextStep: null,
          promptArtifact: null,
        };
      }

      const nextStep = operation.steps.find((step) => step.name === ruleMatch.next) ?? null;
      const noctisGuidance = buildTransitionGuidance(operation, stateTransition);

      if (nextStep && !isWorkerAgentId(nextStep.agent)) {
        const promptArtifact = buildActivationArtifact({
          missionId: input.missionId,
          operation,
          operationState,
          step: nextStep,
          allowedWorkersOverride: input.allowedWorkersOverride,
        });

        if (!input.operationState) {
          saveOperationState(input.missionId, operationState);
        }

        return {
          noctisGuidance: joinXmlSections([noctisGuidance, promptArtifact.promptText]),
          stateTransition,
          nextWorkerDispatch: null,
          operation,
          operationState,
          currentStep,
          nextStep,
          promptArtifact,
        };
      }

      const nextWorkerDispatch = nextStep
        ? {
            step: nextStep.name,
            agentId: nextStep.agent as WorkerAgentId,
          }
        : null;

      if (!input.operationState) {
        saveOperationState(input.missionId, operationState);
      }

      return {
        noctisGuidance,
        stateTransition,
        nextWorkerDispatch,
        operation,
        operationState,
        currentStep,
        nextStep,
        promptArtifact: null,
      };
    },
  };
}
