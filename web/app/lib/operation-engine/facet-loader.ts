import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";
import type { MovementDefinition, OperationDefinition, ResolvedFacets } from "./types";

export type FacetType = "jobs" | "instructions" | "knowledge" | "policies" | "output-contracts";

const MAX_KNOWLEDGE_LENGTH = 2000;

/**
 * 2-layer facet resolution:
 *   1. builtins/{lang}/facets/{type}/{key}.md
 *   2. builtins/en/facets/{type}/{key}.md  (fallback)
 */
function loadFacetFile(type: FacetType, key: string, language: string): string | null {
  const root = getProjectRoot();

  const langPath = join(root, "builtins", language, "facets", type, `${key}.md`);
  if (existsSync(langPath)) {
    return readFileSync(langPath, "utf-8");
  }

  if (language !== "en") {
    const enPath = join(root, "builtins", "en", "facets", type, `${key}.md`);
    if (existsSync(enPath)) {
      return readFileSync(enPath, "utf-8");
    }
  }

  return null;
}

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Resolve all facets referenced by a movement within an operation definition.
 */
export function resolveMovementFacets(
  _operation: OperationDefinition,
  movement: MovementDefinition,
  language: string,
): ResolvedFacets {
  // Job
  const jobKey = movement.job;
  const job = loadFacetFile("jobs", jobKey, language) ?? "";

  // Instruction
  const instructionKey = movement.instruction;
  const instruction = loadFacetFile("instructions", instructionKey, language) ?? "";

  // Knowledge (may be multiple, truncated)
  const knowledgeKeys = toArray(movement.knowledge);
  const knowledge = knowledgeKeys
    .map((key) => {
      const content = loadFacetFile("knowledge", key, language);
      if (!content) return null;
      return content.length > MAX_KNOWLEDGE_LENGTH
        ? `${content.slice(0, MAX_KNOWLEDGE_LENGTH)}\n\n[... truncated ...]`
        : content;
    })
    .filter((item): item is string => item !== null);

  // Policies (may be multiple)
  const policyKeys = toArray(movement.policy);
  const policies = policyKeys
    .map((key) => loadFacetFile("policies", key, language))
    .filter((item): item is string => item !== null);

  // Output contracts
  const outputContracts: string[] = [];
  if (movement.output_contracts?.report) {
    for (const report of movement.output_contracts.report) {
      const content = loadFacetFile("output-contracts", report.format, language);
      if (content) {
        outputContracts.push(content);
      }
    }
  }

  return { job, instruction, knowledge, policies, outputContracts };
}
