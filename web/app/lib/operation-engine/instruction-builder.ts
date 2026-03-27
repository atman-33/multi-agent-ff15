import { basename } from "node:path";
import type { OperationState } from "@/lib/types/mission";
import type {
  MovementDefinition,
  OperationDefinition,
  ResolvedFacets,
} from "./types";

export function describeMovementRole(jobFilePath: string): string {
  if (!jobFilePath.trim()) {
    return "";
  }

  return basename(jobFilePath).replace(/\.md$/i, "");
}

/**
 * Build a composed instruction from resolved facets for a Worker movement.
 * Follows takt's InstructionBuilder pattern with "Lost in the Middle" policy
 * injection (policy summary near top, full policy near bottom).
 */
export function buildAugmentedInstruction(input: {
  movement: MovementDefinition;
  operation: OperationDefinition;
  operationState: OperationState;
  originalInstruction: string;
  previousResponse: string | null;
  facets: ResolvedFacets;
  reportDir: string;
}): string {
  const { movement, operation, operationState, originalInstruction, previousResponse, facets, reportDir } =
    input;
  const sections: string[] = [];

  // [1] Job — role definition
  if (facets.job) {
    sections.push(`## Job\n\n${facets.job}`);
  }

  // [2] Policy Summary — top reminder ("Lost in the Middle" mitigation)
  if (facets.policies.length > 0) {
    sections.push(`## Policy Summary\n\n${buildPolicySummary(facets.policies)}`);
  }

  // [3] Operation Context
  sections.push(buildOperationContextSection(operation, operationState));

  // [4] Task — Noctis's original instruction
  sections.push(`## Task\n\n${originalInstruction}`);

  // [5] Previous Response
  if (movement.pass_previous_response && previousResponse) {
    sections.push(`## Previous Movement Output\n\n${previousResponse}`);
  }

  // [6] Knowledge
  if (facets.knowledge.length > 0) {
    sections.push(`## Knowledge\n\n${facets.knowledge.join("\n\n---\n\n")}`);
  }

  // [7] Instruction
  if (facets.instruction) {
    sections.push(`## Instruction\n\n${facets.instruction}`);
  }

  // [8] Output Contract
  if (facets.outputContracts.length > 0) {
    const contractLines = buildOutputContractSection(movement, reportDir, facets.outputContracts);
    sections.push(contractLines);
  }

  // [9] Policy (full) — bottom
  if (facets.policies.length > 0) {
    sections.push(`## Policy\n\n${facets.policies.join("\n\n---\n\n")}`);
  }

  // [10] Status Output Rules
  if (movement.rules.length > 0) {
    sections.push(buildStatusOutputRules(movement));
  }

  return sections.join("\n\n---\n\n");
}

/**
 * Build an activation instruction for a Noctis self-movement (Hook 1).
 */
export function buildActivationInstruction(input: {
  operation: OperationDefinition;
  movement: MovementDefinition;
  operationState: OperationState;
  facets: ResolvedFacets;
  reportDir: string;
}): string {
  const { operation, movement, operationState, facets, reportDir } = input;
  const sections: string[] = [];

  sections.push(
    [
      "[OPERATION_ACTIVATED]",
      `operation: ${operation.name}`,
      `description: ${operation.description}`,
      `current_movement: ${movement.name}`,
      `your_role: ${describeMovementRole(movement.job_file)}`,
    ].join("\n"),
  );

  if (facets.job) {
    sections.push(`## Job\n\n${facets.job}`);
  }

  sections.push(buildOperationContextSection(operation, operationState));

  if (facets.knowledge.length > 0) {
    sections.push(`## Knowledge\n\n${facets.knowledge.join("\n\n---\n\n")}`);
  }

  if (facets.instruction) {
    sections.push(`## Instruction\n\n${facets.instruction}`);
  }

  if (facets.outputContracts.length > 0) {
    sections.push(buildOutputContractSection(movement, reportDir, facets.outputContracts));
  }

  if (facets.policies.length > 0) {
    sections.push(`## Policy\n\n${facets.policies.join("\n\n---\n\n")}`);
  }

  if (movement.rules.length > 0) {
    sections.push(buildStatusOutputRules(movement));
  }

  return sections.join("\n\n---\n\n");
}

/**
 * Build an operation context summary that can be injected into Crystal→Noctis messages.
 */
export function buildOperationContextSummary(
  operation: OperationDefinition,
  operationState: OperationState,
): string {
  const lastCompleted = operationState.movementHistory
    .filter((h) => h.status === "completed")
    .at(-1);

  const currentMovement = operation.movements.find(
    (m) => m.name === operationState.currentMovement,
  );
  const movementIndex =
    operation.movements.findIndex((m) => m.name === operationState.currentMovement) + 1;
  const totalMovements = operation.movements.length;

  const lines = [
    "[OPERATION_CONTEXT]",
    `operation: ${operation.name}`,
    `current_movement: ${operationState.currentMovement} (${movementIndex}/${totalMovements})`,
    `iteration: ${operationState.iteration} / ${operationState.maxMovements}`,
  ];

  if (lastCompleted) {
    lines.push(
      `last_completed: ${lastCompleted.movement} → "${lastCompleted.ruleCondition ?? "completed"}"`,
    );
  }

  if (currentMovement && currentMovement.agent !== "noctis") {
    lines.push(`next_expected_agent: ${currentMovement.agent}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal section builders
// ---------------------------------------------------------------------------

function buildOperationContextSection(
  operation: OperationDefinition,
  state: OperationState,
): string {
  const movementIndex = operation.movements.findIndex((m) => m.name === state.currentMovement) + 1;
  const total = operation.movements.length;

  const flowLines = operation.movements.map((m, i) => {
    const num = i + 1;
    const isCompleted = state.movementHistory.some(
      (h) => h.movement === m.name && h.status === "completed",
    );
    const isCurrent = m.name === state.currentMovement;

    const prefix = isCompleted ? "✅" : isCurrent ? "→" : "○";
    const suffix = isCurrent ? " — YOU ARE HERE" : "";
    return `  ${num}. ${prefix} ${m.name} (${m.agent})${suffix}`;
  });

  return [
    "## Operation Context",
    "",
    `Operation: ${operation.name} (${operation.description})`,
    `Current Movement: ${state.currentMovement} (${movementIndex} of ${total})`,
    `Iteration: ${state.iteration} / ${state.maxMovements}`,
    "",
    "Movement Flow:",
    ...flowLines,
  ].join("\n");
}

function buildPolicySummary(policies: string[]): string {
  // Extract REJECT lines from policies for the top-level summary
  const rejectLines: string[] = [];
  for (const policy of policies) {
    for (const line of policy.split("\n")) {
      if (line.includes("REJECT") && !line.startsWith("#")) {
        rejectLines.push(line.trim());
      }
    }
  }
  return rejectLines.length > 0
    ? rejectLines.join("\n")
    : "(See full policy section below)";
}

function buildOutputContractSection(
  movement: MovementDefinition,
  reportDir: string,
  contracts: string[],
): string {
  const lines = ["## Output Contract", ""];

  if (movement.output_contracts?.report) {
    for (let i = 0; i < movement.output_contracts.report.length; i++) {
      const report = movement.output_contracts.report[i];
      lines.push(`**File**: ${report.name}`);
      lines.push(`**Output path**: ${reportDir}/${report.name}`);
      if (contracts[i]) {
        lines.push(`**Format**:\n\n${contracts[i]}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

function buildStatusOutputRules(movement: MovementDefinition): string {
  const lines = [
    "## Status Output Rules",
    "",
    "When your work is complete, output exactly **one** of the following status tags:",
    "",
  ];

  for (let i = 0; i < movement.rules.length; i++) {
    lines.push(`- [STEP:${i}] — ${movement.rules[i].condition}`);
  }

  lines.push("");
  lines.push("Place the tag on its own line at the **end** of your response.");

  return lines.join("\n");
}
