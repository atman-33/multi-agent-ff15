import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { getProjectRoot } from "@/lib/get-project-root.server";
import type { MovementDefinition, OperationDefinition, RuleDefinition } from "./types";

/**
 * Parse a raw YAML movement entry into a MovementDefinition.
 */
function normalizeMovement(raw: Record<string, unknown>): MovementDefinition {
  const rules = Array.isArray(raw.rules)
    ? (raw.rules as Record<string, unknown>[]).map(
        (r): RuleDefinition => ({
          condition: String(r.condition ?? ""),
          next: String(r.next ?? ""),
        }),
      )
    : [];

  const outputContracts = raw.output_contracts as
    | { report?: Array<{ name: string; format: string }> }
    | undefined;

  return {
    name: String(raw.name ?? ""),
    agent: String(raw.agent ?? "noctis") as MovementDefinition["agent"],
    job: String(raw.job ?? ""),
    instruction: String(raw.instruction ?? ""),
    knowledge: raw.knowledge as string | string[] | undefined,
    policy: raw.policy as string | string[] | undefined,
    edit: raw.edit === true,
    pass_previous_response: raw.pass_previous_response !== false,
    output_contracts: outputContracts?.report
      ? { report: outputContracts.report }
      : undefined,
    rules,
  };
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = String(v ?? "");
  }
  return result;
}

/**
 * Load and parse an operation YAML file from an absolute path.
 */
export function loadOperationFromFile(absolutePath: string): OperationDefinition {
  if (!existsSync(absolutePath)) {
    throw new Error(`Operation file not found: ${absolutePath}`);
  }
  const content = readFileSync(absolutePath, "utf-8");
  const raw = parseYaml(content) as Record<string, unknown>;

  const movements = Array.isArray(raw.movements)
    ? (raw.movements as Record<string, unknown>[]).map(normalizeMovement)
    : [];

  return {
    name: String(raw.name ?? ""),
    description: String(raw.description ?? ""),
    max_movements: typeof raw.max_movements === "number" ? raw.max_movements : 20,
    initial_movement: String(raw.initial_movement ?? ""),
    jobs: toStringRecord(raw.jobs),
    instructions: toStringRecord(raw.instructions),
    knowledge: toStringRecord(raw.knowledge),
    policies: toStringRecord(raw.policies),
    output_contracts: toStringRecord(raw.output_contracts),
    movements,
  };
}

/**
 * Resolve an operation by name using 2-layer resolution:
 *   1. builtins/{lang}/operations/{name}.yaml
 *   2. builtins/en/operations/{name}.yaml  (fallback for non-en languages)
 */
export function loadOperationByName(
  operationName: string,
  language: string,
): OperationDefinition {
  const root = getProjectRoot();

  // Layer 1: language-specific builtins
  const langPath = join(root, "builtins", language, "operations", `${operationName}.yaml`);
  if (existsSync(langPath)) {
    return loadOperationFromFile(langPath);
  }

  // Layer 2: fallback to English builtins
  if (language !== "en") {
    const enPath = join(root, "builtins", "en", "operations", `${operationName}.yaml`);
    if (existsSync(enPath)) {
      return loadOperationFromFile(enPath);
    }
  }

  throw new Error(`Operation not found: ${operationName}`);
}

/**
 * List all available operation names from builtins.
 */
export function listAvailableOperations(language: string): string[] {
  const root = getProjectRoot();
  const names = new Set<string>();

  for (const lang of [language, "en"]) {
    const dir = join(root, "builtins", lang, "operations");
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          names.add(basename(file).replace(/\.ya?ml$/, ""));
        }
      }
    }
  }

  return [...names];
}

/**
 * Resolve a relative facet path from the operation YAML's section map
 * to an absolute path based on the operation YAML's directory.
 */
export function resolveOperationFacetPath(
  operationFilePath: string,
  relativePath: string,
): string {
  return resolve(dirname(operationFilePath), relativePath);
}
