import { basename } from "node:path";
import type { MovementDefinition, OperationDefinition, ResolvedFacets } from "@/lib/operation-definition/types";
import type { OperationState } from "@/lib/types/mission";
import {
  buildMarkdownSection,
  buildTextSection,
  buildYamlSection,
  joinXmlSections,
} from "./prompt-xml";

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
  const sections: Array<string | null> = [];

  if (facets.job) {
    sections.push(buildMarkdownSection("job", facets.job, { source: movement.job_file }));
  }

  sections.push(buildMovementSection(operation, operationState));
  sections.push(buildTextSection("task", originalInstruction));

  if (movement.pass_previous_response && previousResponse) {
    sections.push(buildTextSection("previous-movement-output", previousResponse));
  }

  if (facets.knowledge.length > 0) {
    for (let index = 0; index < facets.knowledge.length; index += 1) {
      sections.push(
        buildMarkdownSection("knowledge", facets.knowledge[index], {
          source: movement.knowledge_files?.[index],
        }),
      );
    }
  }

  if (facets.instruction) {
    sections.push(buildMarkdownSection("instruction", facets.instruction, { source: movement.instruction_file }));
  }

  if (facets.outputContracts.length > 0) {
    sections.push(...buildOutputContractSections(movement, reportDir, facets.outputContracts));
  }

  if (facets.policies.length > 0) {
    for (let index = 0; index < facets.policies.length; index += 1) {
      sections.push(
        buildMarkdownSection("policy", facets.policies[index], {
          source: movement.policy_files?.[index],
        }),
      );
    }
  }

  if (movement.rules.length > 0) {
    sections.push(buildStatusOutputRules(movement));
  }

  return joinXmlSections(sections);
}

export function buildActivationInstruction(input: {
  operation: OperationDefinition;
  movement: MovementDefinition;
  operationState: OperationState;
  facets: ResolvedFacets;
  reportDir: string;
}): string {
  const { operation, movement, operationState, facets, reportDir } = input;
  const sections: Array<string | null> = [buildMovementSection(operation, operationState)];

  if (facets.job) {
    sections.push(buildMarkdownSection("job", facets.job, { source: movement.job_file }));
  }

  if (facets.knowledge.length > 0) {
    for (let index = 0; index < facets.knowledge.length; index += 1) {
      sections.push(
        buildMarkdownSection("knowledge", facets.knowledge[index], {
          source: movement.knowledge_files?.[index],
        }),
      );
    }
  }

  if (facets.instruction) {
    sections.push(buildMarkdownSection("instruction", facets.instruction, { source: movement.instruction_file }));
  }

  if (facets.outputContracts.length > 0) {
    sections.push(...buildOutputContractSections(movement, reportDir, facets.outputContracts));
  }

  if (facets.policies.length > 0) {
    for (let index = 0; index < facets.policies.length; index += 1) {
      sections.push(
        buildMarkdownSection("policy", facets.policies[index], {
          source: movement.policy_files?.[index],
        }),
      );
    }
  }

  if (movement.rules.length > 0) {
    sections.push(buildStatusOutputRules(movement));
  }

  return joinXmlSections(sections);
}

export function buildOperationContextSummary(
  operation: OperationDefinition,
  operationState: OperationState,
): string {
  const currentMovement = operation.movements.find((movement) => movement.name === operationState.currentMovement);
  const lines = [
    `operation: ${operation.name}`,
    `current_movement: ${operationState.currentMovement}`,
  ];

  if (currentMovement) {
    lines.push(`role: ${describeMovementRole(currentMovement.job_file)}`);
  }

  if (currentMovement && currentMovement.agent !== "noctis") {
    lines.push(`next_expected_agent: ${currentMovement.agent}`);
  }

  return buildYamlSection("movement", lines.join("\n"));
}

function buildMovementSection(operation: OperationDefinition, state: OperationState): string {
  const currentMovement = operation.movements.find((movement) => movement.name === state.currentMovement);
  const lines = [
    `operation: ${operation.name}`,
    `current_movement: ${state.currentMovement}`,
  ];

  if (currentMovement) {
    lines.push(`role: ${describeMovementRole(currentMovement.job_file)}`);
  }

  return buildYamlSection("movement", lines.join("\n"));
}

function buildOutputContractSections(
  movement: MovementDefinition,
  reportDir: string,
  contracts: string[],
): string[] {
  const sections: string[] = [];

  if (movement.output_contracts?.report) {
    for (let index = 0; index < movement.output_contracts.report.length; index += 1) {
      const report = movement.output_contracts.report[index];
      sections.push(
        buildMarkdownSection("output-contract", contracts[index] ?? "", {
          source: report.format_file,
          name: report.name,
          "output-path": `${reportDir}/${report.name}`,
        }),
      );
    }
  }

  return sections;
}

function buildStatusOutputRules(movement: MovementDefinition): string {
  const lines = ["When your work is complete, output exactly one of the following status tags:", ""];

  for (let index = 0; index < movement.rules.length; index += 1) {
    lines.push(`- [STEP:${index}] — ${movement.rules[index].condition}`);
  }

  lines.push("");
  lines.push("Place the tag on its own line at the end of your response.");

  return buildMarkdownSection("status-output-rules", lines.join("\n"));
}