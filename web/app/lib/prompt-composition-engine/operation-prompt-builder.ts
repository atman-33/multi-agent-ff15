import { existsSync } from "node:fs";
import { basename } from "node:path";
import { getMissionOutputFilePath } from "@/lib/mission-store";
import { resolveOperationFacetPath } from "@/lib/operation-definition/operation-loader";
import type {
  ContentSource,
  OperationDefinition,
  ReportOutputContractDefinition,
  ResolvedFacets,
  StepDefinition,
} from "@/lib/operation-definition/types";
import type { OperationState } from "@/lib/types/mission";
import {
  buildMarkdownSection,
  buildTextSection,
  joinXmlSections,
} from "./prompt-xml";

const OUTPUT_PLACEHOLDER_PATTERN =
  /\{\{\s*output\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)\s*\}\}/g;

export function describeStepRole(jobSource: ContentSource | undefined, fallbackName?: string): string {
  if (!jobSource) {
    return "";
  }

  if ("file" in jobSource && typeof jobSource.file === "string") {
    return basename(jobSource.file).replace(/\.md$/i, "");
  }

  return fallbackName ?? "";
}

function describeAgentName(agentId: StepDefinition["agent"]): string {
  switch (agentId) {
    case "noctis":
      return "Noctis";
    case "ignis":
      return "Ignis";
    case "gladiolus":
      return "Gladiolus";
    case "prompto":
      return "Prompto";
  }
}

function describeNextMessageGuidance(
  operation: OperationDefinition,
  nextCandidate: string,
): string {
  const nextStep = operation.steps.find((step) => step.name === nextCandidate);

  if (nextStep) {
    const agentName = describeAgentName(nextStep.agent);
    return nextStep.agent === "noctis"
      ? `Write \`message\` for ${agentName}. Runtime will pass it back as the canonical handoff text for the "${nextStep.name}" step. Do not write it as a User-facing summary.`
      : `Write \`message\` for ${agentName}. Runtime will pass it as the canonical handoff text for the "${nextStep.name}" step. Do not write it as a User-facing summary.`;
  }

  if (nextCandidate === "COMPLETE") {
    return "There is no next workflow step. Write `message` as the final completion summary that Noctis should report to User.";
  }

  if (nextCandidate === "ABORT") {
    return "There is no next workflow step. Write `message` as the blocker summary that Noctis should use to explain why the workflow stopped.";
  }

  return `Write \`message\` as the canonical handoff text for the "${nextCandidate}" step.`;
}

function resolveContentSourceReference(
  operation: OperationDefinition,
  source: ContentSource | undefined,
  inlineLocator: string,
): string | undefined {
  if (!source) {
    return undefined;
  }

  if ("file" in source && typeof source.file === "string") {
    return resolveOperationFacetPath(operation.sourcePath, source.file);
  }

  return `${operation.sourcePath}#${inlineLocator}.inline`;
}

function resolveOutputContract(
  operation: OperationDefinition,
  stepName: string,
  fileName: string,
): ReportOutputContractDefinition {
  const step = operation.steps.find((candidate) => candidate.name === stepName);
  if (!step) {
    throw new Error(`Output placeholder references unknown step "${stepName}".`);
  }

  const report = step.output_contracts?.report.find((candidate) => candidate.name === fileName);
  if (!report) {
    throw new Error(
      `Output placeholder references undeclared file "${fileName}" for step "${stepName}".`,
    );
  }

  return report;
}

function resolveCompletedTaskId(
  operationState: OperationState,
  stepName: string,
  selector: string,
): string {
  if (selector === "latest") {
    const latestMatch = [...operationState.stepHistory]
      .reverse()
      .find(
        (entry) =>
          entry.step === stepName &&
          entry.status === "completed" &&
          typeof entry.taskId === "string" &&
          entry.taskId.trim().length > 0,
      );

    if (!latestMatch?.taskId) {
      throw new Error(`Could not resolve latest output for step "${stepName}".`);
    }

    return latestMatch.taskId;
  }

  if (!selector.startsWith("task:")) {
    throw new Error(
      `Unsupported output selector "${selector}". Use "latest" or "task:<taskId>".`,
    );
  }

  const taskId = selector.slice("task:".length).trim();
  if (!taskId) {
    throw new Error(`Output selector for step "${stepName}" must include a taskId.`);
  }

  const explicitMatch = operationState.stepHistory.find(
    (entry) => entry.step === stepName && entry.status === "completed" && entry.taskId === taskId,
  );
  if (!explicitMatch) {
    throw new Error(`Could not resolve task-scoped output for step "${stepName}" and task "${taskId}".`);
  }

  return taskId;
}

function resolveOutputPlaceholderPath(input: {
  operation: OperationDefinition;
  operationState: OperationState;
  missionId: string;
  stepName: string;
  selector: string;
  fileName: string;
}): string {
  resolveOutputContract(input.operation, input.stepName, input.fileName);
  const taskId = resolveCompletedTaskId(input.operationState, input.stepName, input.selector);
  const outputPath = getMissionOutputFilePath(
    input.missionId,
    input.stepName,
    taskId,
    input.fileName,
  );

  if (!existsSync(outputPath)) {
    throw new Error(
      `Could not resolve output placeholder for step "${input.stepName}" and file "${input.fileName}". Missing file at ${outputPath}.`,
    );
  }

  return outputPath;
}

function resolveInstructionPlaceholders(input: {
  content: string;
  operation: OperationDefinition;
  operationState: OperationState;
  missionId: string;
}): string {
  if (!input.content.includes("{{")) {
    return input.content;
  }

  const resolved = input.content.replace(
    OUTPUT_PLACEHOLDER_PATTERN,
    (_match, stepName: string, selector: string, fileName: string) =>
      resolveOutputPlaceholderPath({
        operation: input.operation,
        operationState: input.operationState,
        missionId: input.missionId,
        stepName,
        selector,
        fileName,
      }),
  );

  if (resolved.includes("{{ output(")) {
    throw new Error(
      'Invalid output placeholder syntax. Use {{ output("step", "selector", "file") }}.',
    );
  }

  return resolved;
}

export function buildAugmentedInstruction(input: {
  step: StepDefinition;
  operation: OperationDefinition;
  operationState: OperationState;
  originalInstruction: string;
  facets: ResolvedFacets;
  missionId: string;
  agentId: StepDefinition["agent"];
  taskId: string;
}): string {
  const { step, operation, originalInstruction, facets } = input;
  const sections: Array<string | null> = [];
  const resolvedInstruction = facets.instruction
    ? resolveInstructionPlaceholders({
        content: facets.instruction,
        operation,
        operationState: input.operationState,
        missionId: input.missionId,
      })
    : "";

  if (facets.job) {
    sections.push(
      buildMarkdownSection("job", facets.job, {
        source: resolveContentSourceReference(operation, step.job, `steps.${step.name}.job`),
      }),
    );
  }

  sections.push(buildTextSection("task", originalInstruction));

  if (facets.knowledge.length > 0) {
    for (let index = 0; index < facets.knowledge.length; index += 1) {
      sections.push(
        buildMarkdownSection("knowledge", facets.knowledge[index], {
          source: resolveContentSourceReference(
            operation,
            step.knowledge?.[index],
            `steps.${step.name}.knowledge[${index}]`,
          ),
        }),
      );
    }
  }

  if (resolvedInstruction) {
    sections.push(
      buildMarkdownSection("instruction", resolvedInstruction, {
        source: resolveContentSourceReference(
          operation,
          step.instruction,
          `steps.${step.name}.instruction`,
        ),
      }),
    );
  }

  if (facets.outputContracts.length > 0) {
    sections.push(
      ...buildOutputContractSections(
        operation,
        step,
        input.missionId,
        input.taskId,
        facets.outputContracts,
      ),
    );
  }

  if (facets.policies.length > 0) {
    for (let index = 0; index < facets.policies.length; index += 1) {
      sections.push(
        buildMarkdownSection("policy", facets.policies[index], {
          source: resolveContentSourceReference(
            operation,
            step.policies?.[index],
            `steps.${step.name}.policies[${index}]`,
          ),
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
  missionId: string;
  taskId: string;
}): string {
  const { operation, step, facets } = input;
  const sections: Array<string | null> = [];
  const resolvedInstruction = facets.instruction
    ? resolveInstructionPlaceholders({
        content: facets.instruction,
        operation,
        operationState: input.operationState,
        missionId: input.missionId,
      })
    : "";

  if (facets.job) {
    sections.push(
      buildMarkdownSection("job", facets.job, {
        source: resolveContentSourceReference(operation, step.job, `steps.${step.name}.job`),
      }),
    );
  }

  if (facets.knowledge.length > 0) {
    for (let index = 0; index < facets.knowledge.length; index += 1) {
      sections.push(
        buildMarkdownSection("knowledge", facets.knowledge[index], {
          source: resolveContentSourceReference(
            operation,
            step.knowledge?.[index],
            `steps.${step.name}.knowledge[${index}]`,
          ),
        }),
      );
    }
  }

  if (resolvedInstruction) {
    sections.push(
      buildMarkdownSection("instruction", resolvedInstruction, {
        source: resolveContentSourceReference(
          operation,
          step.instruction,
          `steps.${step.name}.instruction`,
        ),
      }),
    );
  }

  if (facets.outputContracts.length > 0) {
    sections.push(
      ...buildOutputContractSections(
        operation,
        step,
        input.missionId,
        input.taskId,
        facets.outputContracts,
      ),
    );
  }

  if (facets.policies.length > 0) {
    for (let index = 0; index < facets.policies.length; index += 1) {
      sections.push(
        buildMarkdownSection("policy", facets.policies[index], {
          source: resolveContentSourceReference(
            operation,
            step.policies?.[index],
            `steps.${step.name}.policies[${index}]`,
          ),
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
  _operation: OperationDefinition,
  _operationState: OperationState,
): string {
  return "";
}

function buildOutputContractSections(
  operation: OperationDefinition,
  step: StepDefinition,
  missionId: string,
  taskId: string,
  contracts: string[],
): string[] {
  const sections: string[] = [];

  if (step.output_contracts?.report) {
    for (let index = 0; index < step.output_contracts.report.length; index += 1) {
      const report = step.output_contracts.report[index];
      sections.push(
        buildMarkdownSection("output-contract", contracts[index] ?? "", {
          source: resolveContentSourceReference(
            operation,
            report.format,
            `steps.${step.name}.output_contracts.report[${index}].format`,
          ),
          name: report.name,
          "output-path": getMissionOutputFilePath(missionId, step.name, taskId, report.name),
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
    lines.push("How to write `message`:");
    for (const nextCandidate of nextCandidates) {
      lines.push(`- ${nextCandidate}: ${describeNextMessageGuidance(operation, nextCandidate)}`);
    }
    if (step.agent === "noctis" && !isInitialNoctisStep) {
      lines.push("");
      lines.push("After sending any required User-facing response, run exactly one report command to finalize the step.");
    }
  } else {
    lines.push("Use one allowed `next` value and one quoted `message` when calling `scripts/send_report.sh`.");
  }

  return buildMarkdownSection("step-completion-contract", lines.join("\n"));
}