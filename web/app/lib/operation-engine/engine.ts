import { readAppConfig } from "@/lib/app-config.server";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { checkAgentDeviation } from "./deviation-tracker";
import { resolveMovementFacets } from "./facet-loader";
import {
  buildActivationInstruction,
  buildAugmentedInstruction,
  buildOperationContextSummary,
  describeMovementRole,
} from "./instruction-builder";
import { listAvailableOperations, loadOperationByName } from "./operation-loader";
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
  OperationDefinition,
  OperationState,
  ProcessCrystalMessageInput,
  ProcessCrystalMessageResult,
  ProcessReportInput,
  ProcessReportResult,
  StateTransition,
} from "./types";

// ---------------------------------------------------------------------------
// Language helper
// ---------------------------------------------------------------------------

function getLanguage(): string {
  try {
    const config = readAppConfig(getProjectRoot());
    return config.language || "en";
  } catch {
    return "en";
  }
}

// ---------------------------------------------------------------------------
// Operation name detection
// ---------------------------------------------------------------------------

/**
 * Detect a known operation name in the user's message.
 * Returns the operation name if found, null otherwise.
 */
function detectOperationName(message: string): string | null {
  const language = getLanguage();
  const knownOperations = listAvailableOperations(language);
  for (const name of knownOperations) {
    if (message.includes(name)) {
      return name;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hook 1: Crystal → Noctis
// ---------------------------------------------------------------------------

/**
 * Process a Crystal→Noctis message.
 * Handles:
 *  (A) Operation activation when an operation name is detected
 *  (B) Noctis self-movement [STEP:N] detection on continue
 *  (C) Operation context injection when operation is active
 */
export function processCrystalMessage(
  input: ProcessCrystalMessageInput,
  lastNoctisResponse?: string,
): ProcessCrystalMessageResult {
  const { missionId, message, isNewMission } = input;
  const language = getLanguage();

  // --- (A) Operation activation ---
  const existingState = getOperationState(missionId);

  if (!existingState) {
    const operationName =
      Object.hasOwn(input, "selectedOperation")
        ? input.selectedOperation?.trim() || null
        : detectOperationName(message);
    if (!operationName) {
      return { additionalContext: null };
    }

    // Activate the operation
    const operation = loadOperationByName(operationName, language);
    const state = createOperationState(
      operationName,
      operation.initial_movement,
      operation.max_movements,
    );
    saveOperationState(missionId, state);

    const initialMovement = operation.movements.find(
      (m) => m.name === operation.initial_movement,
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

    // Record initial movement as dispatched (self-movement)
    recordMovementDispatched(state, initialMovement.name, initialMovement.agent);
    saveOperationState(missionId, state);

    return {
      additionalContext: activationText,
      operationActivated: operationName,
    };
  }

  // Operation is active
  const operation = loadOperationByName(existingState.operationName, language);

  // --- (B) Noctis self-movement [STEP:N] detection ---
  if (!isNewMission && lastNoctisResponse) {
    const currentMovement = operation.movements.find(
      (m) => m.name === existingState.currentMovement,
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

        // If the next movement is terminal, report that
        if (ruleMatch.next === "COMPLETE" || ruleMatch.next === "ABORT") {
          const terminalGuidance = buildTerminalGuidance(operation, existingState, ruleMatch.next);
          return {
            additionalContext: terminalGuidance,
            stateTransition: transition,
          };
        }

        // Inject context for the next movement
        const nextMovement = operation.movements.find((m) => m.name === ruleMatch.next);
        if (nextMovement) {
          const guidance = buildTransitionGuidance(operation, existingState, transition);
          return {
            additionalContext: guidance,
            stateTransition: transition,
          };
        }
      }
    }
  }

  // --- (C) Context injection for active operation ---
  const contextSummary = buildOperationContextSummary(operation, existingState);
  return { additionalContext: contextSummary };
}

// ---------------------------------------------------------------------------
// Hook 2: Noctis → Worker (task dispatch)
// ---------------------------------------------------------------------------

/**
 * Augment a task prompt with operation-aware facets for a Worker.
 */
export function augmentTaskPrompt(input: AugmentTaskPromptInput): string {
  const { operationState, originalPrompt, agentId, missionId } = input;
  const language = getLanguage();

  if (operationState.status !== "running" && operationState.status !== "waiting_for_report") {
    return originalPrompt;
  }

  const operation = loadOperationByName(operationState.operationName, language);
  const currentMovement = operation.movements.find(
    (m) => m.name === operationState.currentMovement,
  );

  if (!currentMovement) {
    return originalPrompt;
  }

  // Check for agent deviation
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

  // Record this movement as dispatched
  recordMovementDispatched(operationState, currentMovement.name, agentId);
  saveOperationState(missionId, operationState);

  if (deviationNote) {
    return `${augmented}\n\n---\n\n${deviationNote}`;
  }

  return augmented;
}

// ---------------------------------------------------------------------------
// Hook 3: Worker → Noctis (report receipt)
// ---------------------------------------------------------------------------

/**
 * Process a worker report and determine the next movement.
 */
export function processReport(input: ProcessReportInput): ProcessReportResult {
  const { operationState, reportBody, reportDetails } = input;
  const language = getLanguage();

  const operation = loadOperationByName(operationState.operationName, language);
  const currentMovement = operation.movements.find(
    (m) => m.name === operationState.currentMovement,
  );

  if (!currentMovement || currentMovement.rules.length === 0) {
    return {
      noctisGuidance: "",
      stateTransition: null,
    };
  }

  // Combine body + details for tag extraction
  const fullReport = reportDetails ? `${reportBody}\n\n${reportDetails}` : reportBody;
  const ruleMatch = evaluateRules(fullReport, currentMovement.rules);

  if (!ruleMatch) {
    return {
      noctisGuidance:
        "[OPERATION_NOTE] Could not determine next movement from the agent's report. " +
        "No [STEP:N] tag found. Please review the report and decide the next step.",
      stateTransition: null,
    };
  }

  const transition: StateTransition = {
    previousMovement: operationState.currentMovement,
    nextMovement: ruleMatch.next,
    ruleMatched: ruleMatch.matchedIndex,
    ruleCondition: ruleMatch.condition,
  };

  // Apply transition
  recordMovementCompleted(operationState, transition, reportBody.slice(0, 500));

  // Build guidance for Noctis
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

// ---------------------------------------------------------------------------
// Guidance builders
// ---------------------------------------------------------------------------

function buildTransitionGuidance(
  operation: OperationDefinition,
  state: OperationState,
  transition: StateTransition,
): string {
  const nextMovement = operation.movements.find(
    (m) => m.name === transition.nextMovement,
  );

  const completedCount = state.movementHistory.filter((h) => h.status === "completed").length;
  const total = operation.movements.length;

  const lines = [
    "[OPERATION_PROGRESS]",
    `operation: ${operation.name}`,
    `completed_movement: ${transition.previousMovement}`,
    `matched_rule: [STEP:${transition.ruleMatched}] "${transition.ruleCondition}"`,
    `next_movement: ${transition.nextMovement}`,
  ];

  if (nextMovement) {
    lines.push(`next_agent: ${nextMovement.agent}`);
    lines.push(`next_job: ${describeMovementRole(nextMovement.job_file)}`);
  }

  lines.push(`progress: ${completedCount}/${total} movements complete`);
  lines.push(`iteration: ${state.iteration} / ${state.maxMovements}`);

  if (nextMovement) {
    lines.push("");
    lines.push("Suggested next action:");
    if (nextMovement.agent === "noctis") {
      lines.push(`  Begin the "${nextMovement.name}" movement yourself.`);
    } else {
      lines.push(
        `  Dispatch a task to ${nextMovement.agent} for the "${nextMovement.name}" movement.`,
      );
    }
  }

  return lines.join("\n");
}

function buildTerminalGuidance(
  operation: OperationDefinition,
  state: OperationState,
  terminal: "COMPLETE" | "ABORT",
): string {
  const historyLines = state.movementHistory
    .filter((h) => h.status === "completed")
    .map(
      (h, i) =>
        `  ${i + 1}. ${h.movement} (${h.agent}) → "${h.ruleCondition ?? "completed"}" → ${h.nextMovement ?? "?"}`,
    );

  const lines = [
    `[OPERATION_${terminal}]`,
    `operation: ${operation.name}`,
    `final_movement: ${state.currentMovement}`,
    `total_iterations: ${state.iteration}`,
    `status: ${terminal.toLowerCase()}`,
  ];

  if (historyLines.length > 0) {
    lines.push("movement_history:");
    lines.push(...historyLines);
  }

  lines.push("");
  if (terminal === "COMPLETE") {
    lines.push("The operation has completed successfully.");
    lines.push("Report final results to Crystal.");
  } else {
    lines.push("The operation has been aborted.");
    lines.push("Report the situation to Crystal with relevant context.");
  }

  return lines.join("\n");
}
