import { existsSync, readFileSync } from "node:fs";
import {
  normalizeFileSkillEntry,
} from "@/lib/skill-catalog.server";
import { resolveOperationFacetPath } from "./operation-loader";
import type {
  ContentSource,
  FileContentSource,
  OperationDefinition,
  ResolvedFacets,
  ResolvedSkillEntry,
  StepDefinition,
} from "./types";

function loadFacetSource(
  operation: OperationDefinition,
  source: ContentSource | undefined,
): string | null {
  if (!source) {
    return null;
  }

  if ("inline" in source && typeof source.inline === "string") {
    return source.inline;
  }

  const absolutePath = resolveOperationFacetPath(operation.sourcePath, source.file);
  if (!existsSync(absolutePath)) {
    return null;
  }

  return readFileSync(absolutePath, "utf-8");
}

function describeContentSourceReference(
  operation: OperationDefinition,
  source: ContentSource | undefined,
  inlineLocator: string,
): string {
  if (!source) {
    return `${operation.sourcePath}#${inlineLocator}`;
  }

  if ("file" in source && typeof source.file === "string") {
    return resolveOperationFacetPath(operation.sourcePath, source.file);
  }

  return `${operation.sourcePath}#${inlineLocator}.inline`;
}

function resolveKnowledgeSources(input: {
  operation: OperationDefinition;
  step: StepDefinition;
  sources: FileContentSource[];
  locatorPrefix: string;
}): ResolvedSkillEntry[] {
  return input.sources
    .map((source, index) => {
      const absolutePath = resolveOperationFacetPath(input.operation.sourcePath, source.file);
      if (!existsSync(absolutePath)) {
        throw new Error(
          `Missing workflow skill source at ${absolutePath} referenced by ${input.locatorPrefix}[${index}].`,
        );
      }

      const content = readFileSync(absolutePath, "utf-8");

      return normalizeFileSkillEntry(content, absolutePath);
    })
    .filter((item): item is ResolvedSkillEntry => item !== null);
}

function resolvePolicySources(
  operation: OperationDefinition,
  sources: ContentSource[],
): string[] {
  return sources
    .map((source) => loadFacetSource(operation, source))
    .filter((item): item is string => item !== null);
}

function findMarkdownHeadingPositions(content: string, heading: "Format" | "Rule"): number[] {
  return [...content.matchAll(new RegExp(`^##\\s+${heading}\\s*$`, "gm"))].map(
    (match) => match.index ?? -1,
  );
}

function assertValidOutputContractContent(content: string, sourceReference: string): void {
  const formatHeadings = findMarkdownHeadingPositions(content, "Format");
  const ruleHeadings = findMarkdownHeadingPositions(content, "Rule");

  if (
    formatHeadings.length !== 1 ||
    ruleHeadings.length !== 1 ||
    formatHeadings[0] > ruleHeadings[0]
  ) {
    throw new Error(
      `Output contract format at ${sourceReference} must contain exactly one "## Format" section followed by one "## Rule" section.`,
    );
  }
}

export function resolveStepFacets(
  operation: OperationDefinition,
  step: StepDefinition,
  _language: string,
): ResolvedFacets {
  const job = loadFacetSource(operation, step.job) ?? "";
  const instruction = loadFacetSource(operation, step.instruction) ?? "";

  const skills = resolveKnowledgeSources({
    operation,
    step,
    sources: step.skills ?? [],
    locatorPrefix: `steps.${step.name}.skills`,
  });

  const policies = resolvePolicySources(operation, step.policies ?? []);

  const outputContracts: string[] = [];
  if (step.output_contracts?.report) {
    for (let index = 0; index < step.output_contracts.report.length; index += 1) {
      const report = step.output_contracts.report[index];
      const content = loadFacetSource(operation, report.format);
      if (content) {
        assertValidOutputContractContent(
          content,
          describeContentSourceReference(
            operation,
            report.format,
            `steps.${step.name}.output_contracts.report[${index}].format`,
          ),
        );
        outputContracts.push(content);
      }
    }
  }

  return { job, instruction, skills, policies, outputContracts };
}

export function resolveDelegatedWorkerFacets(
  operation: OperationDefinition,
  step: StepDefinition,
  _language: string,
): ResolvedFacets {
  const delegation = step.delegation;
  const job = loadFacetSource(operation, delegation?.worker_job) ?? "";
  const instruction = loadFacetSource(operation, delegation?.worker_instruction) ?? "";
  const skills = resolveKnowledgeSources({
    operation,
    step,
    sources: delegation?.worker_skills ?? [],
    locatorPrefix: `steps.${step.name}.delegation.worker_skills`,
  });
  const policies = resolvePolicySources(operation, delegation?.worker_policies ?? []);

  return {
    job,
    instruction,
    skills,
    policies,
    outputContracts: [],
  };
}