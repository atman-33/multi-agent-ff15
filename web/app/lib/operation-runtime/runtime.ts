import { readOperationLanguage } from "@/lib/operation-definition/language";
import { resolveMovementFacets } from "@/lib/operation-definition/facet-loader";
import { listAvailableOperations, loadOperationByName } from "@/lib/operation-definition/operation-loader";
import type { OperationDefinition } from "@/lib/operation-definition/types";
import {
  buildActivationInstruction,
  buildAugmentedInstruction,
  buildOperationContextSummary,
  describeMovementRole,
} from "@/lib/prompt-composition-engine/operation-prompt-builder";
import { buildTextSection, buildYamlSection, joinXmlSections } from "@/lib/prompt-composition-engine/prompt-xml";
import { checkAgentDeviation } from "./deviation-tracker";
import { evaluateRules } from "./rule-evaluator";
import {
  createOperationState,
  getOperationState,
  recordMovementCompleted,
  recordMovementDispatched,
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
    const state = createOperationState(
      operationName,
      operation.initial_movement,
      operation.max_movements,
    );
    saveOperationState(missionId, state);

    const initialMovement = operation.movements.find(
      (movement) => movement.name === operation.initial_movement,
    );
    if (!initialMovement) {
      return { additionalContext: null, operationActivated: operationName };
    }

    const facets = resolveMovementFacets(operation, initialMovement, language);
    const activationText = buildActivationInstruction({
      operation,
      movement: initialMovement,
      operationState: state,
      facets,
      reportDir: state.reportDir,
    });

    recordMovementDispatched(state, initialMovement.name, initialMovement.agent);
    saveOperationState(missionId, state);

    return {
      additionalContext: activationText,
      operationActivated: operationName,
    };
  }

  const operation = loadOperationByName(existingState.operationName, language);
  if (!isNewMission && lastNoctisResponse) {
    const currentMovement = operation.movements.find(
      (movement) => movement.name === existingState.currentMovement,
    );

    if (currentMovement?.agent === "noctis" && currentMovement.rules.length > 0) {
      const ruleMatch = evaluateRules(lastNoctisResponse, currentMovement.rules);
      if (ruleMatch) {
        const transition: StateTransition = {
          previousMovement: existingState.currentMovement,
          nextMovement: ruleMatch.next,
          ruleMatched: ruleMatch.matchedIndex,
          ruleCondition: ruleMatch.condition,
        };

        recordMovementCompleted(existingState, transition, lastNoctisResponse.slice(0, 500));
        saveOperationState(missionId, existingState);

        if (ruleMatch.next === "COMPLETE" || ruleMatch.next === "ABORT") {
          return {
            additionalContext: buildTerminalGuidance(operation, existingState, ruleMatch.next),
            stateTransition: transition,
          };
        }

        const nextMovement = operation.movements.find((movement) => movement.name === ruleMatch.next);
        if (nextMovement) {
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
  const currentMovement = operation.movements.find(
    (movement) => movement.name === operationState.currentMovement,
  );
  if (!currentMovement) {
    return originalPrompt;
  }

  const deviationNote = checkAgentDeviation(operationState, currentMovement.agent, agentId);
  if (deviationNote) {
    saveOperationState(missionId, operationState);
  }

  const facets = resolveMovementFacets(operation, currentMovement, language);
  const augmented = buildAugmentedInstruction({
    movement: currentMovement,
    operation,
    operationState,
    originalInstruction: originalPrompt,
    previousResponse: operationState.previousResponse,
    facets,
    reportDir: operationState.reportDir,
  });

  recordMovementDispatched(operationState, currentMovement.name, agentId);
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
  const currentMovement = operation.movements.find(
    (movement) => movement.name === operationState.currentMovement,
  );

  if (!currentMovement || currentMovement.rules.length === 0) {
    return { noctisGuidance: "", stateTransition: null };
  }

  const fullReport = reportDetails ? `${reportBody}\n\n${reportDetails}` : reportBody;
  const ruleMatch = evaluateRules(fullReport, currentMovement.rules);

  if (!ruleMatch) {
    return {
      noctisGuidance: buildTextSection(
        "operation-note",
        "Could not determine next movement from the agent's report. No [STEP:N] tag found. Please review the report and decide the next step.",
      ),
      stateTransition: null,
    };
  }

  const transition: StateTransition = {
    previousMovement: operationState.currentMovement,
    nextMovement: ruleMatch.next,
    ruleMatched: ruleMatch.matchedIndex,
    ruleCondition: ruleMatch.condition,
  };

  recordMovementCompleted(operationState, transition, reportBody.slice(0, 500));

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
  state: OperationState,
  transition: StateTransition,
): string {
  const nextMovement = operation.movements.find((movement) => movement.name === transition.nextMovement);
  const lines = [
    `operation: ${operation.name}`,
    `completed_movement: ${transition.previousMovement}`,
    `matched_rule: [STEP:${transition.ruleMatched}] "${transition.ruleCondition}"`,
    `next_movement: ${transition.nextMovement}`,
  ];

  if (nextMovement) {
    lines.push(`next_agent: ${nextMovement.agent}`);
    lines.push(`next_job: ${describeMovementRole(nextMovement.job_file)}`);
  }

  return joinXmlSections([
    buildYamlSection("movement-transition", lines.join("\n")),
    nextMovement
      ? buildTextSection(
          "next-action",
          nextMovement.agent === "noctis"
            ? `Begin the \"${nextMovement.name}\" movement yourself.`
            : `Dispatch a task to ${nextMovement.agent} for the \"${nextMovement.name}\" movement.`,
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
    `final_movement: ${state.currentMovement}`,
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