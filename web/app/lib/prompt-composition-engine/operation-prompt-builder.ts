import { basename } from "node:path";
import type { MovementDefinition, OperationDefinition, ResolvedFacets } from "@/lib/operation-definition/types";
import type { OperationState } from "@/lib/types/mission";

export function describeMovementRole(jobFilePath: string): string {
  if (!jobFilePath.trim()) {
    return "";
  }

  return basename(jobFilePath).replace(/\.md$/i, "");
}

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

  if (facets.job) {
    sections.push(`## Job\n\n${facets.job}`);
  }

  if (facets.policies.length > 0) {
    sections.push(`## Policy Summary\n\n${buildPolicySummary(facets.policies)}`);
  }

  sections.push(buildOperationContextSection(operation, operationState));
  sections.push(`## Task\n\n${originalInstruction}`);

  if (movement.pass_previous_response && previousResponse) {
    sections.push(`## Previous Movement Output\n\n${previousResponse}`);
  }

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

export function buildOperationContextSummary(
  operation: OperationDefinition,
  operationState: OperationState,
): string {
  const lastCompleted = operationState.movementHistory.filter((entry) => entry.status === "completed").at(-1);
  const currentMovement = operation.movements.find((movement) => movement.name === operationState.currentMovement);
  const movementIndex = operation.movements.findIndex((movement) => movement.name === operationState.currentMovement) + 1;
  const totalMovements = operation.movements.length;

  const lines = [
    "[OPERATION_CONTEXT]",
    `operation: ${operation.name}`,
    `current_movement: ${operationState.currentMovement} (${movementIndex}/${totalMovements})`,
    `iteration: ${operationState.iteration} / ${operationState.maxMovements}`,
  ];

  if (lastCompleted) {
    lines.push(`last_completed: ${lastCompleted.movement} → "${lastCompleted.ruleCondition ?? "completed"}"`);
  }

  if (currentMovement && currentMovement.agent !== "noctis") {
    lines.push(`next_expected_agent: ${currentMovement.agent}`);
  }

  return lines.join("\n");
}

function buildOperationContextSection(operation: OperationDefinition, state: OperationState): string {
  const movementIndex = operation.movements.findIndex((movement) => movement.name === state.currentMovement) + 1;
  const total = operation.movements.length;

  const flowLines = operation.movements.map((movement, index) => {
    const number = index + 1;
    const isCompleted = state.movementHistory.some(
      (entry) => entry.movement === movement.name && entry.status === "completed",
    );
    const isCurrent = movement.name === state.currentMovement;
    const prefix = isCompleted ? "✅" : isCurrent ? "→" : "○";
    const suffix = isCurrent ? " — YOU ARE HERE" : "";
    return `  ${number}. ${prefix} ${movement.name} (${movement.agent})${suffix}`;
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
  const rejectLines: string[] = [];
  for (const policy of policies) {
    for (const line of policy.split("\n")) {
      if (line.includes("REJECT") && !line.startsWith("#")) {
        rejectLines.push(line.trim());
      }
    }
  }

  return rejectLines.length > 0 ? rejectLines.join("\n") : "(See full policy section below)";
}

function buildOutputContractSection(
  movement: MovementDefinition,
  reportDir: string,
  contracts: string[],
): string {
  const lines = ["## Output Contract", ""];

  if (movement.output_contracts?.report) {
    for (let index = 0; index < movement.output_contracts.report.length; index += 1) {
      const report = movement.output_contracts.report[index];
      lines.push(`**File**: ${report.name}`);
      lines.push(`**Output path**: ${reportDir}/${report.name}`);
      if (contracts[index]) {
        lines.push(`**Format**:\n\n${contracts[index]}`);
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

  for (let index = 0; index < movement.rules.length; index += 1) {
    lines.push(`- [STEP:${index}] — ${movement.rules[index].condition}`);
  }

  lines.push("");
  lines.push("Place the tag on its own line at the **end** of your response.");

  return lines.join("\n");
}