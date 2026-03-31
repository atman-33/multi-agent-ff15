import { readOperationLanguage } from "@/lib/operation-definition/language";
import { resolveStepFacets } from "@/lib/operation-definition/facet-loader";
import { listAvailableOperations, loadOperationByName } from "@/lib/operation-definition/operation-loader";
import type { OperationDefinition } from "@/lib/operation-definition/types";
import {
  buildActivationInstruction,
  buildAugmentedInstruction,
  buildOperationContextSummary,
  describeStepRole,
} from "@/lib/prompt-composition-engine/operation-prompt-builder";
import { buildTextSection, buildYamlSection, joinXmlSections } from "@/lib/prompt-composition-engine/prompt-xml";
import { checkAgentDeviation } from "./deviation-tracker";
import { evaluateRules } from "./rule-evaluator";
import {
  createOperationState,
  getOperationState,
  recordStepCompleted,
  recordStepDispatched,
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
  lastNoctisResponse?: string,
): ProcessUserMessageResult {
  const { missionId, message, isNewMission } = input;
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

    const facets = resolveStepFacets(operation, initialStep, language);
    const activationText = buildActivationInstruction({
      operation,
      step: initialStep,
      operationState: state,
      facets,
      reportDir: state.reportDir,
    });

    recordStepDispatched(state, initialStep.name, initialStep.agent);
    saveOperationState(missionId, state);

    return {
      additionalContext: activationText,
      operationActivated: operationName,
    };
  }

  const operation = loadOperationByName(existingState.operationName, language);
  if (!isNewMission && lastNoctisResponse) {
    const currentStep = operation.steps.find(
      (step) => step.name === existingState.currentStep,
    );

    if (currentStep?.agent === "noctis" && currentStep.rules.length > 0) {
      const ruleMatch = evaluateRules(lastNoctisResponse, currentStep.rules);
      if (ruleMatch) {
        const transition: StateTransition = {
          previousStep: existingState.currentStep,
          nextStep: ruleMatch.next,
          ruleMatched: ruleMatch.matchedIndex,
          ruleCondition: ruleMatch.condition,
        };

        recordStepCompleted(existingState, transition, lastNoctisResponse.slice(0, 500));
        saveOperationState(missionId, existingState);

        if (ruleMatch.next === "COMPLETE" || ruleMatch.next === "ABORT") {
          return {
            additionalContext: buildTerminalGuidance(operation, existingState, ruleMatch.next),
            stateTransition: transition,
          };
        }

        const nextStep = operation.steps.find((step) => step.name === ruleMatch.next);
        if (nextStep) {
          return {
            additionalContext: buildTransitionGuidance(operation, existingState, transition),
            stateTransition: transition,
          };
        }
      }
    }
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
    previousResponse: operationState.previousResponse,
    facets,
    reportDir: operationState.reportDir,
  });

  recordStepDispatched(operationState, currentStep.name, agentId);
  saveOperationState(missionId, operationState);

  if (deviationNote) {
    return joinXmlSections([augmented, buildTextSection("deviation-note", deviationNote)]);
  }

  return augmented;
}

export function processReport(input: ProcessReportInput): ProcessReportResult {
  const { operationState, reportBody, reportDetails } = input;
  const language = readOperationLanguage();
  const operation = loadOperationByName(operationState.operationName, language);
  const currentStep = operation.steps.find(
    (step) => step.name === operationState.currentStep,
  );

  if (!currentStep || currentStep.rules.length === 0) {
    return { noctisGuidance: "", stateTransition: null };
  }

  const fullReport = reportDetails ? `${reportBody}\n\n${reportDetails}` : reportBody;
  const ruleMatch = evaluateRules(fullReport, currentStep.rules);

  if (!ruleMatch) {
    return {
      noctisGuidance: buildTextSection(
        "operation-note",
        "Could not determine the next step from the agent's report. No [STEP:N] tag found. Please review the report and decide the next step.",
      ),
      stateTransition: null,
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
    };
  }

  return {
    noctisGuidance: buildTransitionGuidance(operation, operationState, transition),
    stateTransition: transition,
  };
}

function buildTransitionGuidance(
  operation: OperationDefinition,
  _state: OperationState,
  transition: StateTransition,
): string {
  const nextStep = operation.steps.find((step) => step.name === transition.nextStep);
  const lines = [
    `operation: ${operation.name}`,
    `completed_step: ${transition.previousStep}`,
    `matched_rule: [STEP:${transition.ruleMatched}] "${transition.ruleCondition}"`,
    `next_step: ${transition.nextStep}`,
  ];

  if (nextStep) {
    lines.push(`next_agent: ${nextStep.agent}`);
    lines.push(`next_job: ${describeStepRole(nextStep.job_file)}`);
  }

  return joinXmlSections([
    buildYamlSection("step-transition", lines.join("\n")),
    nextStep
      ? buildTextSection(
          "next-action",
          nextStep.agent === "noctis"
            ? `Begin the "${nextStep.name}" step yourself.`
            : `Dispatch a task to ${nextStep.agent} for the "${nextStep.name}" step.`,
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