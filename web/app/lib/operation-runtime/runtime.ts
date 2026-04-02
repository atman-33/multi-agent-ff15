import { readOperationLanguage } from "@/lib/operation-definition/language";
import { resolveStepFacets } from "@/lib/operation-definition/facet-loader";
import { listAvailableOperations, loadOperationByName } from "@/lib/operation-definition/operation-loader";
import type { OperationDefinition, StepDefinition } from "@/lib/operation-definition/types";
import {
  buildActivationInstruction,
  buildAugmentedInstruction,
  buildOperationContextSummary,
  describeStepRole,
} from "@/lib/prompt-composition-engine/operation-prompt-builder";
import { buildTextSection, buildYamlSection, joinXmlSections } from "@/lib/prompt-composition-engine/prompt-xml";
import { checkAgentDeviation } from "./deviation-tracker";
import { evaluateNextStep } from "./rule-evaluator";
import {
  createOperationState,
  ensureActiveStepTaskId,
  getOperationState,
  recordStepCompleted,
  saveOperationState,
} from "./state";
import type {
  AugmentTaskPromptInput,
  OperationState,
  ProcessUserMessageInput,
  ProcessUserMessageResult,
  ProcessReportInput,
  ProcessReportResult,
  StateTransition,
} from "./types";

function detectOperationName(message: string): string | null {
  const language = readOperationLanguage();
  const knownOperations = listAvailableOperations(language);
  for (const name of knownOperations) {
    if (message.includes(name)) {
      return name;
    }
  }
  return null;
}

export function processUserMessage(
  input: ProcessUserMessageInput,
): ProcessUserMessageResult {
  const { missionId, message } = input;
  const language = readOperationLanguage();
  const existingState = getOperationState(missionId);

  if (!existingState) {
    const operationName = Object.hasOwn(input, "selectedOperation")
      ? input.selectedOperation?.trim() || null
      : detectOperationName(message);
    if (!operationName) {
      return { additionalContext: null };
    }

    const operation = loadOperationByName(operationName, language);
    const state = createOperationState(operationName, operation.initial_step);
    saveOperationState(missionId, state);

    const initialStep = operation.steps.find(
      (step) => step.name === operation.initial_step,
    );
    if (!initialStep) {
      return { additionalContext: null, operationActivated: operationName };
    }

    const activationText =
      initialStep.agent === "noctis"
        ? buildNoctisStepInstruction({
            missionId,
            operation,
            operationState: state,
            step: initialStep,
            language,
          })
        : buildOperationContextSummary(operation, state);

    saveOperationState(missionId, state);

    return {
      additionalContext: activationText,
      operationActivated: operationName,
    };
  }

  const operation = loadOperationByName(existingState.operationName, language);
  const currentStep = operation.steps.find(
    (step) => step.name === existingState.currentStep,
  );

  if (currentStep?.agent === "noctis") {
    const activationText = buildNoctisStepInstruction({
      missionId,
      operation,
      operationState: existingState,
      step: currentStep,
      language,
    });
    saveOperationState(missionId, existingState);
    return { additionalContext: activationText };
  }

  return { additionalContext: buildOperationContextSummary(operation, existingState) };
}

export function augmentTaskPrompt(input: AugmentTaskPromptInput): string {
  const { operationState, originalPrompt, agentId, missionId } = input;
  const language = readOperationLanguage();

  if (operationState.status !== "running" && operationState.status !== "waiting_for_report") {
    return originalPrompt;
  }

  const operation = loadOperationByName(operationState.operationName, language);
  const currentStep = operation.steps.find(
    (step) => step.name === operationState.currentStep,
  );
  if (!currentStep) {
    return originalPrompt;
  }

  const deviationNote = checkAgentDeviation(operationState, currentStep.agent, agentId);
  if (deviationNote) {
    saveOperationState(missionId, operationState);
  }

  const facets = resolveStepFacets(operation, currentStep, language);
  const augmented = buildAugmentedInstruction({
    step: currentStep,
    operation,
    operationState,
    originalInstruction: originalPrompt,
    facets,
    reportDir: operationState.reportDir,
    missionId,
    agentId,
    taskId: input.taskId,
  });
  saveOperationState(missionId, operationState);

  if (deviationNote) {
    return joinXmlSections([augmented, buildTextSection("deviation-note", deviationNote)]);
  }

  return augmented;
}

export function processReport(input: ProcessReportInput): ProcessReportResult {
  const { missionId, operationState, reportBody, next } = input;
  const language = readOperationLanguage();
  const operation = loadOperationByName(operationState.operationName, language);
  const currentStep = operation.steps.find(
    (step) => step.name === operationState.currentStep,
  );

  if (!currentStep || currentStep.rules.length === 0) {
    return { noctisGuidance: "", stateTransition: null, nextWorkerDispatch: null };
  }

  const ruleMatch = typeof next === "string" && next.trim()
    ? evaluateNextStep(next, currentStep.rules)
    : null;

  if (!ruleMatch) {
    return {
      noctisGuidance: buildTextSection(
        "operation-note",
        "Could not determine the next step from the step report. Missing or invalid next.",
      ),
      stateTransition: null,
      nextWorkerDispatch: null,
    };
  }

  const transition: StateTransition = {
    previousStep: operationState.currentStep,
    nextStep: ruleMatch.next,
    ruleMatched: ruleMatch.matchedIndex,
    ruleCondition: ruleMatch.condition,
  };

  recordStepCompleted(operationState, transition, reportBody.slice(0, 500));

  if (ruleMatch.next === "COMPLETE" || ruleMatch.next === "ABORT") {
    return {
      noctisGuidance: buildTerminalGuidance(operation, operationState, ruleMatch.next),
      stateTransition: transition,
      nextWorkerDispatch: null,
    };
  }

  const nextStep = operation.steps.find((step) => step.name === ruleMatch.next);
  const guidance = buildTransitionGuidance(operation, transition);

  if (nextStep?.agent === "noctis") {
    const activationText = buildNoctisStepInstruction({
      missionId,
      operation,
      operationState,
      step: nextStep,
      language,
    });

    return {
      noctisGuidance: joinXmlSections([guidance, activationText]),
      stateTransition: transition,
      nextWorkerDispatch: null,
    };
  }

  if (nextStep) {
    return {
      noctisGuidance: guidance,
      stateTransition: transition,
      nextWorkerDispatch: {
        step: nextStep.name,
        agentId: nextStep.agent,
      },
    };
  }

  return {
    noctisGuidance: guidance,
    stateTransition: transition,
    nextWorkerDispatch: null,
  };
}

function buildNoctisStepInstruction(input: {
  missionId: string;
  operation: OperationDefinition;
  operationState: OperationState;
  step: StepDefinition;
  language: string;
}): string {
  const taskId = ensureActiveStepTaskId(input.operationState, input.step.agent);
  const facets = resolveStepFacets(input.operation, input.step, input.language);
  return buildActivationInstruction({
    operation: input.operation,
    step: input.step,
    operationState: input.operationState,
    facets,
    reportDir: input.operationState.reportDir,
    missionId: input.missionId,
    taskId,
  });
}

function buildTransitionGuidance(
  operation: OperationDefinition,
  transition: StateTransition,
): string {
  const nextStep = operation.steps.find((step) => step.name === transition.nextStep);
  const nextAction =
    nextStep?.agent === "noctis" ? "begin_self_step" : nextStep ? "dispatch_worker" : "review_transition";
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
          nextStep.agent === "noctis"
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