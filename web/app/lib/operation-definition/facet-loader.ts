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
    for (const report of step.output_contracts.report) {
      const content = loadFacetSource(operation, report.format);
      if (content) {
        outputContracts.push(content);
      }
    }
  }

  return { job, instruction, knowledge, policies, outputContracts };
}