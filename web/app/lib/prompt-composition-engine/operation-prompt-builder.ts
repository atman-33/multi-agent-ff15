import { existsSync } from "node:fs";
import { basename } from "node:path";
import { getAgentLabel, isWorkerAgentId } from "@/lib/agent-identity";
import { readAppConfig } from "@/lib/app-config.server";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { buildSkillsCatalog, mergeSkillEntries } from "@/lib/skill-catalog.server";
import type { ResolvedSkillEntry } from "@/lib/operation-definition/types";
import { getMissionOutputFilePath } from "@/lib/mission-store";
import { getRuntimeScriptPath } from "@/lib/runtime-script-path";
import type {
  ContentSource,
  OperationDefinition,
  ReportOutputContractDefinition,
  ResolvedFacets,
  StepDefinition,
} from "@/lib/operation-definition/types";
import {
  isAutonomousDelegationStep,
  resolveEffectiveDelegationWorkers,
} from "@/lib/operation-runtime/autonomous";
import type { AgentId, OperationState, WorkerAgentId } from "@/lib/types/mission";
import {
  buildMarkdownSection,
  buildTextSection,
  joinXmlSections,
} from "./prompt-xml";

const OUTPUT_PLACEHOLDER_PATTERN =
  /\{\{\s*output\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)\s*\}\}/g;
const SETTING_PLACEHOLDER_PATTERN =
  /\{\{\s*setting\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)\s*\}\}/g;

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
  return getAgentLabel(agentId);
}

function describeNextMessageGuidance(
  operation: OperationDefinition,
  nextCandidate: string,
): string {
  const nextStep = operation.steps.find((step) => step.name === nextCandidate);
  const initialStep = operation.steps.find((step) => step.name === operation.initial_step);
  const primaryAgentLabel =
    initialStep && !isWorkerAgentId(initialStep.agent)
      ? getAgentLabel(initialStep.agent)
      : "the primary agent";

  if (nextStep) {
    const agentName = describeAgentName(nextStep.agent);
    return !isWorkerAgentId(nextStep.agent)
      ? `Write \`message\` for ${agentName}. Runtime will pass it back as the canonical handoff text for the "${nextStep.name}" step. Do not write it as a User-facing summary.`
      : `Write \`message\` for ${agentName}. Runtime will pass it as the canonical handoff text for the "${nextStep.name}" step. Do not write it as a User-facing summary.`;
  }

  if (nextCandidate === "COMPLETE") {
    return `There is no next workflow step. Write \`message\` as the final completion summary that ${primaryAgentLabel} should report to User.`;
  }

  if (nextCandidate === "ABORT") {
    return `There is no next workflow step. Write \`message\` as the blocker summary that ${primaryAgentLabel} should use to explain why the workflow stopped.`;
  }

  return `Write \`message\` as the canonical handoff text for the "${nextCandidate}" step.`;
}

function buildOutputContractGuidance(_operation: OperationDefinition, outputPath: string): string {
  return [
    `Create the file at ${outputPath} using the following format.`,
    "",
    "- Create the specified file before completing the step",
    "- The file contents must follow the `Format` below",
    "- Do not complete the step until the file exists",
  ].join("\n");
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

function resolveSettingPlaceholderValue(key: string, mode: string): string {
  if (key !== "language") {
    throw new Error(`Unsupported setting placeholder key \"${key}\".`);
  }

  if (mode !== "name") {
    throw new Error(`Unsupported setting placeholder mode \"${mode}\" for key \"${key}\".`);
  }

  const language = readAppConfig(getProjectRoot()).language;

  if (language === "ja") {
    return "japanese";
  }

  if (language === "en") {
    return "english";
  }

  return language;
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

  const outputResolved = input.content.replace(
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

  const resolved = outputResolved.replace(
    SETTING_PLACEHOLDER_PATTERN,
    (_match, key: string, mode: string) => resolveSettingPlaceholderValue(key, mode),
  );

  if (resolved.includes("{{ output(")) {
    throw new Error(
      'Invalid output placeholder syntax. Use {{ output("step", "selector", "file") }}.',
    );
  }

  if (resolved.includes("{{ setting(")) {
    throw new Error(
      'Invalid setting placeholder syntax. Use {{ setting("key", "mode") }}.',
    );
  }

  return resolved;
}

export interface StepHandoffSource {
  step: string;
  agent: AgentId;
  taskId?: string;
  summary: string;
}

export function findStepHandoffSource(input: {
  stepName: string;
  operationState: OperationState;
}): StepHandoffSource | null {
  const handoffSource = [...input.operationState.stepHistory]
    .reverse()
    .find(
      (entry) =>
        entry.status === "completed" &&
        entry.nextStep === input.stepName &&
        typeof entry.summary === "string" &&
        entry.summary.trim().length > 0,
    );

  if (!handoffSource?.summary) {
    return null;
  }

  return {
    step: handoffSource.step,
    agent: handoffSource.agent,
    taskId: handoffSource.taskId,
    summary: handoffSource.summary.trim(),
  };
}

function buildHandoffSection(input: {
  stepName: string;
  operationState: OperationState;
}): string | null {
  const handoffSource = findStepHandoffSource(input);

  if (!handoffSource) {
    return null;
  }

  const lines = [
    `from_step: ${handoffSource.step}`,
    `from_agent: ${handoffSource.agent}`,
  ];

  if (handoffSource.taskId?.trim()) {
    lines.push(`task_id: ${handoffSource.taskId}`);
  }

  lines.push("message: |");
  for (const line of handoffSource.summary.split(/\r?\n/)) {
    lines.push(`  ${line}`);
  }

  return buildTextSection("handoff", lines.join("\n"));
}

export function buildAugmentedInstruction(input: {
  step: StepDefinition;
  operation: OperationDefinition;
  operationState: OperationState;
  facets: ResolvedFacets;
  missionId: string;
  agentId: StepDefinition["agent"];
  taskId: string;
  sharedSkillEntries?: readonly ResolvedSkillEntry[];
}): string {
  const { step, operation, facets } = input;
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
    sections.push(buildMarkdownSection("job", facets.job));
  }

  sections.push(
    buildHandoffSection({
      stepName: step.name,
      operationState: input.operationState,
    }),
  );

  sections.push(buildSkillsCatalog(mergeSkillEntries(facets.skills, input.sharedSkillEntries)));

  if (resolvedInstruction) {
    sections.push(buildMarkdownSection("instruction", resolvedInstruction));
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
      sections.push(buildMarkdownSection("policy", facets.policies[index]));
    }
  }

  if (step.rules.length > 0) {
    sections.push(buildStepCompletionContract(operation, step, input));
  }

  return joinXmlSections(sections);
}

function buildDelegationGuidance(input: {
  missionId: string;
  step: StepDefinition;
  allowedWorkersOverride?: readonly WorkerAgentId[];
}): string | null {
  if (!input.step.delegation) {
    return null;
  }

  const effectiveWorkers = resolveEffectiveDelegationWorkers({
    missionId: input.missionId,
    step: input.step,
    allowedWorkersOverride: input.allowedWorkersOverride,
  });
  const authoredWorkers = input.step.delegation.allowed_workers;
  const sendTaskScript = getRuntimeScriptPath("send_task.sh");
  const sendReportScript = getRuntimeScriptPath("send_report.sh");
  const primaryAgentName = getAgentLabel(input.step.agent);
  const lines = [
    input.step.rules.length === 0
      ? `This is an open-ended ${primaryAgentName}-owned step. Stay in conversation with User and dispatch child tasks only when they help advance the work.`
      : "You may dispatch supporting child tasks while you remain responsible for the current workflow step.",
    "",
  ];

  if (effectiveWorkers.length > 0) {
    lines.push("Effective allowed workers:");
    for (const worker of effectiveWorkers) {
      lines.push(`- ${worker}`);
    }
    lines.push("");
    lines.push("Delegate one child task with the bash tool:");
    for (const worker of effectiveWorkers) {
      lines.push(`- ${sendTaskScript} ${input.missionId} ${worker} "<message>"`);
    }
    lines.push("");
    lines.push("Delegation rules:");
    lines.push("- Write one focused task message per child task.");
    lines.push(`- Child task reports return to this ${primaryAgentName}-owned step.`);
    lines.push(
      `- Do not use \`${sendReportScript}\` for the parent step unless this step also defines workflow rules.`,
    );
  } else {
    lines.push("Effective allowed workers: none");
    lines.push("");
    if (authoredWorkers.length > 0) {
      lines.push(
        `The authored delegation policy allows ${authoredWorkers.join(", ")}, but the current working-party restriction leaves no available worker.`,
      );
    } else {
      lines.push("No worker is authored for delegation in this step.");
    }
    lines.push("Continue the conversation yourself until delegation becomes available.");
  }

  return buildMarkdownSection("delegation-guidance", lines.join("\n"));
}

function shouldOmitAutonomousSoloFacets(input: {
  missionId: string;
  step: StepDefinition;
  allowedWorkersOverride?: readonly WorkerAgentId[];
}): boolean {
  if (!isAutonomousDelegationStep(input.step)) {
    return false;
  }

  if (input.step.delegation.allowed_workers.length === 0) {
    return false;
  }

  return (
    resolveEffectiveDelegationWorkers({
      missionId: input.missionId,
      step: input.step,
      allowedWorkersOverride: input.allowedWorkersOverride,
    }).length === 0
  );
}

export function buildDelegatedWorkerInstruction(input: {
  taskPrompt: string;
  step: StepDefinition;
  agentId: WorkerAgentId;
  operation: OperationDefinition;
  operationState: OperationState;
  facets: ResolvedFacets;
  missionId: string;
  sharedSkillEntries?: readonly ResolvedSkillEntry[];
}): string {
  const sections: Array<string | null> = [
    buildTextSection("task", input.taskPrompt, {
      from: input.step.agent,
      to: input.agentId,
    }),
  ];
  const resolvedInstruction = input.facets.instruction
    ? resolveInstructionPlaceholders({
        content: input.facets.instruction,
        operation: input.operation,
        operationState: input.operationState,
        missionId: input.missionId,
      })
    : "";

  if (input.facets.job) {
    sections.push(buildMarkdownSection("job", input.facets.job));
  }

  sections.push(
    buildHandoffSection({
      stepName: input.step.name,
      operationState: input.operationState,
    }),
  );

  sections.push(
    buildSkillsCatalog(mergeSkillEntries(input.facets.skills, input.sharedSkillEntries)),
  );

  if (resolvedInstruction) {
    sections.push(buildMarkdownSection("instruction", resolvedInstruction));
  }

  if (input.facets.policies.length > 0) {
    for (let index = 0; index < input.facets.policies.length; index += 1) {
      sections.push(buildMarkdownSection("policy", input.facets.policies[index]));
    }
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
  allowedWorkersOverride?: readonly WorkerAgentId[];
  sharedSkillEntries?: readonly ResolvedSkillEntry[];
}): string {
  const { operation, step, facets } = input;
  const sections: Array<string | null> = [];
  const omitAutonomousSoloFacets = shouldOmitAutonomousSoloFacets({
    missionId: input.missionId,
    step,
    allowedWorkersOverride: input.allowedWorkersOverride,
  });
  const resolvedInstruction = !omitAutonomousSoloFacets && facets.instruction
    ? resolveInstructionPlaceholders({
        content: facets.instruction,
        operation,
        operationState: input.operationState,
        missionId: input.missionId,
      })
    : "";

  if (!omitAutonomousSoloFacets && facets.job) {
    sections.push(buildMarkdownSection("job", facets.job));
  }

  sections.push(
    buildHandoffSection({
      stepName: step.name,
      operationState: input.operationState,
    }),
  );

  if (!omitAutonomousSoloFacets) {
    sections.push(buildSkillsCatalog(mergeSkillEntries(facets.skills, input.sharedSkillEntries)));
  }

  if (!omitAutonomousSoloFacets && resolvedInstruction) {
    sections.push(buildMarkdownSection("instruction", resolvedInstruction));
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
      sections.push(buildMarkdownSection("policy", facets.policies[index]));
    }
  }

  sections.push(
    buildDelegationGuidance({
      missionId: input.missionId,
      step,
      allowedWorkersOverride: input.allowedWorkersOverride,
    }),
  );

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
      const outputPath = getMissionOutputFilePath(missionId, step.name, taskId, report.name);
      const guidance = buildOutputContractGuidance(operation, outputPath);
      const contractBody = contracts[index] ?? "";
      sections.push(
        buildMarkdownSection("output-contract", contractBody ? `${guidance}\n\n${contractBody}` : guidance),
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
  const isInitialPrimaryStep = !isWorkerAgentId(step.agent) && step.name === operation.initial_step;
  const primaryAgentName = getAgentLabel(step.agent);
  const nextCandidates = [...new Set(step.rules.map((rule) => rule.next.trim()).filter(Boolean))];
  const sendReportScript = getRuntimeScriptPath("send_report.sh");
  const lines = [
    isInitialPrimaryStep
      ? `Continue the conversation normally until you are ready to advance this workflow step. Do not run \`${sendReportScript}\` until you choose one of the allowed \`next\` values below.`
      : !isWorkerAgentId(step.agent)
        ? `When this ${primaryAgentName}-owned workflow step is ready to finish, choose one allowed \`next\` value and send one canonical \`message\` payload.`
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
        `- ${sendReportScript} ${context.missionId} ${context.agentId} ${context.taskId} ${nextCandidate} "<message>"`,
      );
    }
    lines.push("");
    lines.push("How to write `message`:");
    for (const nextCandidate of nextCandidates) {
      lines.push(`- ${nextCandidate}: ${describeNextMessageGuidance(operation, nextCandidate)}`);
    }
    if (!isWorkerAgentId(step.agent) && !isInitialPrimaryStep) {
      lines.push("");
      lines.push("After sending any required User-facing response, run exactly one report command to finalize the step.");
    }
  } else {
    lines.push(`Use one allowed \`next\` value and one quoted \`message\` when calling \`${sendReportScript}\`.`);
  }

  return buildMarkdownSection("step-completion-contract", lines.join("\n"));
}