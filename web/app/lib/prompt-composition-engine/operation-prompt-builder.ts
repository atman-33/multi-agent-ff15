import { basename } from "node:path";
import { resolveOperationFacetPath } from "@/lib/operation-definition/operation-loader";
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

function resolveOperationSourcePath(
  operation: OperationDefinition,
  sourcePath: string | undefined,
): string | undefined {
  if (!sourcePath) {
    return undefined;
  }

  return resolveOperationFacetPath(operation.sourcePath, sourcePath);
}

export function buildAugmentedInstruction(input: {
  step: StepDefinition;
  operation: OperationDefinition;
  operationState: OperationState;
  originalInstruction: string;
  previousResponse: string | null;
  facets: ResolvedFacets;
  reportDir: string;
  missionId: string;
  agentId: StepDefinition["agent"];
  taskId: string;
}): string {
  const { step, operation, operationState, originalInstruction, previousResponse, facets, reportDir } =
    input;
  const sections: Array<string | null> = [];

  if (facets.job) {
    sections.push(
      buildMarkdownSection("job", facets.job, {
        source: resolveOperationSourcePath(operation, step.job_file),
      }),
    );
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
          source: resolveOperationSourcePath(operation, step.knowledge_files?.[index]),
        }),
      );
    }
  }

  if (facets.instruction) {
    sections.push(
      buildMarkdownSection("instruction", facets.instruction, {
        source: resolveOperationSourcePath(operation, step.instruction_file),
      }),
    );
  }

  if (facets.outputContracts.length > 0) {
    sections.push(...buildOutputContractSections(operation, step, reportDir, facets.outputContracts));
  }

  if (facets.policies.length > 0) {
    for (let index = 0; index < facets.policies.length; index += 1) {
      sections.push(
        buildMarkdownSection("policy", facets.policies[index], {
          source: resolveOperationSourcePath(operation, step.policy_files?.[index]),
        }),
      );
    }
  }

  if (step.rules.length > 0) {
    sections.push(buildStatusOutputRules(step, input));
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
    sections.push(
      buildMarkdownSection("job", facets.job, {
        source: resolveOperationSourcePath(operation, step.job_file),
      }),
    );
  }

  if (facets.knowledge.length > 0) {
    for (let index = 0; index < facets.knowledge.length; index += 1) {
      sections.push(
        buildMarkdownSection("knowledge", facets.knowledge[index], {
          source: resolveOperationSourcePath(operation, step.knowledge_files?.[index]),
        }),
      );
    }
  }

  if (facets.instruction) {
    sections.push(
      buildMarkdownSection("instruction", facets.instruction, {
        source: resolveOperationSourcePath(operation, step.instruction_file),
      }),
    );
  }

  if (facets.outputContracts.length > 0) {
    sections.push(...buildOutputContractSections(operation, step, reportDir, facets.outputContracts));
  }

  if (facets.policies.length > 0) {
    for (let index = 0; index < facets.policies.length; index += 1) {
      sections.push(
        buildMarkdownSection("policy", facets.policies[index], {
          source: resolveOperationSourcePath(operation, step.policy_files?.[index]),
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
  operation: OperationDefinition,
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
          source: resolveOperationSourcePath(operation, report.format_file),
          name: report.name,
          "output-path": `${reportDir}/${report.name}`,
        }),
      );
    }
  }

  return sections;
}

function buildStatusOutputRules(
  step: StepDefinition,
  context?: { missionId: string; agentId: StepDefinition["agent"]; taskId: string },
): string {
  if (step.agent === "noctis") {
    const lines = [
      "When this Noctis-owned workflow step is complete, end your response with exactly one status tag:",
      "",
    ];

    for (let index = 0; index < step.rules.length; index += 1) {
      lines.push(`- [STEP:${index}] — ${step.rules[index].condition}`);
    }

    lines.push("");
    lines.push("Place the tag on its own line at the end of your response.");

    return buildMarkdownSection("status-output-rules", lines.join("\n"));
  }

  const lines = [
    "When reporting this workflow step, choose exactly one allowed outcome index and send it with `--rule-index`.",
    "",
    "Allowed outcomes:",
  ];

  for (let index = 0; index < step.rules.length; index += 1) {
    lines.push(`- ${index} — ${step.rules[index].condition}`);
  }

  lines.push("");
  if (context) {
    lines.push("Report with the bash tool using the same task ID:");
    lines.push(
      `scripts/send_report.sh ${context.missionId} ${context.agentId} ${context.taskId} completed "<summary>" --rule-index <index>`,
    );
  } else {
    lines.push("Include the selected index when calling `scripts/send_report.sh`.");
  }
  lines.push("Use `running` for progress updates without a final outcome index.");
  lines.push("Use the report status (`completed`, `blocked`, or `failed`) together with `--rule-index <index>` for final step completion.");
  lines.push("Do not use `[STEP:N]` tags in the response body for worker routing.");

  return buildMarkdownSection("status-output-rules", lines.join("\n"));
}