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

  sections.push(buildStepSection(operation, operationState, input.taskId));
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
    sections.push(buildStepCompletionContract(operation, step, input));
  }

  return joinXmlSections(sections);
}

export function buildActivationInstruction(input: {
  operation: OperationDefinition;
  step: StepDefinition;
  operationState: OperationState;
  facets: ResolvedFacets;
  reportDir: string;
  missionId: string;
  taskId: string;
}): string {
  const { operation, step, operationState, facets, reportDir } = input;
  const sections: Array<string | null> = [buildStepSection(operation, operationState, input.taskId)];

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
    sections.push(
      buildStepCompletionContract(operation, step, {
        missionId: input.missionId,
        agentId: step.agent,
        taskId: input.taskId,
      }),
    );
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

  const latestStep = operationState.stepHistory.at(-1);
  if (latestStep?.step === operationState.currentStep && latestStep.taskId) {
    lines.push(`task_id: ${latestStep.taskId}`);
  }

  return buildYamlSection("step", lines.join("\n"));
}

function buildStepSection(operation: OperationDefinition, state: OperationState, taskId?: string): string {
  const currentStep = operation.steps.find((step) => step.name === state.currentStep);
  const lines = [
    `operation: ${operation.name}`,
    `current_step: ${state.currentStep}`,
  ];

  if (currentStep) {
    lines.push(`role: ${describeStepRole(currentStep.job_file)}`);
  }

  const resolvedTaskId =
    taskId ??
    (state.stepHistory.at(-1)?.step === state.currentStep
      ? state.stepHistory.at(-1)?.taskId
      : undefined);
  if (resolvedTaskId) {
    lines.push(`task_id: ${resolvedTaskId}`);
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

function buildStepCompletionContract(
  operation: OperationDefinition,
  step: StepDefinition,
  context?: { missionId: string; agentId: StepDefinition["agent"]; taskId: string },
): string {
  const isInitialNoctisStep = step.agent === "noctis" && step.name === operation.initial_step;
  const nextCandidates = [...new Set(step.rules.map((rule) => rule.next.trim()).filter(Boolean))];
  const lines = [
    isInitialNoctisStep
      ? "Continue the conversation normally until you are ready to advance this workflow step. Do not run `scripts/send_report.sh` until you choose one of the allowed `next` values below."
      : step.agent === "noctis"
        ? "When this Noctis-owned workflow step is ready to finish, choose one allowed `next` value and send one canonical `message` payload."
        : "When this workflow step is complete, choose one allowed `next` value and send one canonical `message` payload.",
    "",
    "Allowed next values:",
  ];

  for (const nextCandidate of nextCandidates) {
    const exampleRule = step.rules.find((rule) => rule.next === nextCandidate);
    const description = exampleRule?.condition?.trim();
    lines.push(description ? `- ${nextCandidate} — ${description}` : `- ${nextCandidate}`);
  }

  lines.push("");
  if (context) {
    lines.push("Report with the bash tool using the same task ID and one quoted message:");
    for (const nextCandidate of nextCandidates) {
      lines.push(
        `- scripts/send_report.sh ${context.missionId} ${context.agentId} ${context.taskId} ${nextCandidate} "<message>"`,
      );
    }
    lines.push("");
    lines.push("Use `message` as the canonical handoff text for the next workflow step.");
    if (step.agent === "noctis" && !isInitialNoctisStep) {
      lines.push("After sending any required User-facing response, run exactly one report command to finalize the step.");
    }
  } else {
    lines.push("Use one allowed `next` value and one quoted `message` when calling `scripts/send_report.sh`.");
  }

  return buildMarkdownSection("step-completion-contract", lines.join("\n"));
}