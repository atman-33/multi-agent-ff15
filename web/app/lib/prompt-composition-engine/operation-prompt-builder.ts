import { basename } from "node:path";
import type { OperationDefinition, ResolvedFacets, StepDefinition } from "@/lib/operation-definition/types";
import type { OperationState } from "@/lib/types/mission";
import {
  buildMarkdownSection,
  buildTextSection,
  buildYamlSection,
  joinXmlSections,
} from "./prompt-xml";

export function describeStepRole(jobFilePath: string): string {
  if (!jobFilePath.trim()) {
    return "";
  }

  return basename(jobFilePath).replace(/\.md$/i, "");
}

export function buildAugmentedInstruction(input: {
  step: StepDefinition;
  operation: OperationDefinition;
  operationState: OperationState;
  originalInstruction: string;
  previousResponse: string | null;
  facets: ResolvedFacets;
  reportDir: string;
}): string {
  const { step, operation, operationState, originalInstruction, previousResponse, facets, reportDir } =
    input;
  const sections: Array<string | null> = [];

  if (facets.job) {
    sections.push(buildMarkdownSection("job", facets.job, { source: step.job_file }));
  }

  sections.push(buildStepSection(operation, operationState));
  sections.push(buildTextSection("task", originalInstruction));

  if (step.pass_previous_response && previousResponse) {
    sections.push(buildTextSection("previous-step-output", previousResponse));
  }

  if (facets.knowledge.length > 0) {
    for (let index = 0; index < facets.knowledge.length; index += 1) {
      sections.push(
        buildMarkdownSection("knowledge", facets.knowledge[index], {
          source: step.knowledge_files?.[index],
        }),
      );
    }
  }

  if (facets.instruction) {
    sections.push(buildMarkdownSection("instruction", facets.instruction, { source: step.instruction_file }));
  }

  if (facets.outputContracts.length > 0) {
    sections.push(...buildOutputContractSections(step, reportDir, facets.outputContracts));
  }

  if (facets.policies.length > 0) {
    for (let index = 0; index < facets.policies.length; index += 1) {
      sections.push(
        buildMarkdownSection("policy", facets.policies[index], {
          source: step.policy_files?.[index],
        }),
      );
    }
  }

  if (step.rules.length > 0) {
    sections.push(buildStatusOutputRules(step));
  }

  return joinXmlSections(sections);
}

export function buildActivationInstruction(input: {
  operation: OperationDefinition;
  step: StepDefinition;
  operationState: OperationState;
  facets: ResolvedFacets;
  reportDir: string;
}): string {
  const { operation, step, operationState, facets, reportDir } = input;
  const sections: Array<string | null> = [buildStepSection(operation, operationState)];

  if (facets.job) {
    sections.push(buildMarkdownSection("job", facets.job, { source: step.job_file }));
  }

  if (facets.knowledge.length > 0) {
    for (let index = 0; index < facets.knowledge.length; index += 1) {
      sections.push(
        buildMarkdownSection("knowledge", facets.knowledge[index], {
          source: step.knowledge_files?.[index],
        }),
      );
    }
  }

  if (facets.instruction) {
    sections.push(buildMarkdownSection("instruction", facets.instruction, { source: step.instruction_file }));
  }

  if (facets.outputContracts.length > 0) {
    sections.push(...buildOutputContractSections(step, reportDir, facets.outputContracts));
  }

  if (facets.policies.length > 0) {
    for (let index = 0; index < facets.policies.length; index += 1) {
      sections.push(
        buildMarkdownSection("policy", facets.policies[index], {
          source: step.policy_files?.[index],
        }),
      );
    }
  }

  if (step.rules.length > 0) {
    sections.push(buildStatusOutputRules(step));
  }

  return joinXmlSections(sections);
}

export function buildOperationContextSummary(
  operation: OperationDefinition,
  operationState: OperationState,
): string {
  const currentStep = operation.steps.find((step) => step.name === operationState.currentStep);
  const lines = [
    `operation: ${operation.name}`,
    `current_step: ${operationState.currentStep}`,
  ];

  if (currentStep) {
    lines.push(`role: ${describeStepRole(currentStep.job_file)}`);
  }

  if (currentStep && currentStep.agent !== "noctis") {
    lines.push(`next_expected_agent: ${currentStep.agent}`);
  }

  return buildYamlSection("step", lines.join("\n"));
}

function buildStepSection(operation: OperationDefinition, state: OperationState): string {
  const currentStep = operation.steps.find((step) => step.name === state.currentStep);
  const lines = [
    `operation: ${operation.name}`,
    `current_step: ${state.currentStep}`,
  ];

  if (currentStep) {
    lines.push(`role: ${describeStepRole(currentStep.job_file)}`);
  }

  return buildYamlSection("step", lines.join("\n"));
}

function buildOutputContractSections(
  step: StepDefinition,
  reportDir: string,
  contracts: string[],
): string[] {
  const sections: string[] = [];

  if (step.output_contracts?.report) {
    for (let index = 0; index < step.output_contracts.report.length; index += 1) {
      const report = step.output_contracts.report[index];
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

function buildStatusOutputRules(step: StepDefinition): string {
  const lines = ["When your work is complete, output exactly one of the following status tags:", ""];

  for (let index = 0; index < step.rules.length; index += 1) {
    lines.push(`- [STEP:${index}] — ${step.rules[index].condition}`);
  }

  lines.push("");
  lines.push("Place the tag on its own line at the end of your response.");

  return buildMarkdownSection("status-output-rules", lines.join("\n"));
}