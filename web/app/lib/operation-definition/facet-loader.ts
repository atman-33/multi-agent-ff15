import { existsSync, readFileSync } from "node:fs";
import { resolveOperationFacetPath } from "./operation-loader";
import type { ContentSource, OperationDefinition, ResolvedFacets, StepDefinition } from "./types";

const MAX_KNOWLEDGE_LENGTH = 2000;

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

  const knowledge = (step.knowledge ?? [])
    .map((source) => {
      const content = loadFacetSource(operation, source);
      if (!content) {
        return null;
      }

      return content.length > MAX_KNOWLEDGE_LENGTH
        ? `${content.slice(0, MAX_KNOWLEDGE_LENGTH)}\n\n[... truncated ...]`
        : content;
    })
    .filter((item): item is string => item !== null);

  const policies = (step.policies ?? [])
    .map((source) => loadFacetSource(operation, source))
    .filter((item): item is string => item !== null);

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

  return { job, instruction, knowledge, policies, outputContracts };
}