import { existsSync, readFileSync } from "node:fs";
import { resolveOperationFacetPath } from "./operation-loader";
import type { MovementDefinition, OperationDefinition, ResolvedFacets } from "./types";

const MAX_KNOWLEDGE_LENGTH = 2000;

function loadFacetFile(operation: OperationDefinition, relativePath: string | undefined): string | null {
  if (!relativePath) {
    return null;
  }

  const absolutePath = resolveOperationFacetPath(operation.sourcePath, relativePath);
  if (!existsSync(absolutePath)) {
    return null;
  }

  return readFileSync(absolutePath, "utf-8");
}

/**
 * Resolve all facets referenced by a movement within an operation definition.
 */
export function resolveMovementFacets(
  operation: OperationDefinition,
  movement: MovementDefinition,
  _language: string,
): ResolvedFacets {
  const job = loadFacetFile(operation, movement.job_file) ?? "";
  const instruction = loadFacetFile(operation, movement.instruction_file) ?? "";

  const knowledge = (movement.knowledge_files ?? [])
    .map((path) => {
      const content = loadFacetFile(operation, path);
      if (!content) return null;
      return content.length > MAX_KNOWLEDGE_LENGTH
        ? `${content.slice(0, MAX_KNOWLEDGE_LENGTH)}\n\n[... truncated ...]`
        : content;
    })
    .filter((item): item is string => item !== null);

  const policies = (movement.policy_files ?? [])
    .map((path) => loadFacetFile(operation, path))
    .filter((item): item is string => item !== null);

  const outputContracts: string[] = [];
  if (movement.output_contracts?.report) {
    for (const report of movement.output_contracts.report) {
      const content = loadFacetFile(operation, report.format_file);
      if (content) {
        outputContracts.push(content);
      }
    }
  }

  return { job, instruction, knowledge, policies, outputContracts };
}
