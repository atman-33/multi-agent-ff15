import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { getProjectRoot } from "@/lib/get-project-root.server";
import type { MovementDefinition, OperationDefinition, RuleDefinition } from "./types";

function normalizeMovement(raw: Record<string, unknown>): MovementDefinition {
  const rules = Array.isArray(raw.rules)
    ? (raw.rules as Record<string, unknown>[]).map(
        (rule): RuleDefinition => ({
          condition: String(rule.condition ?? ""),
          next: String(rule.next ?? ""),
        }),
      )
    : [];

  const outputContracts = raw.output_contracts as
    | { report?: Array<{ name: string; format_file: string }> }
    | undefined;

  return {
    name: String(raw.name ?? ""),
    agent: String(raw.agent ?? "noctis") as MovementDefinition["agent"],
    job_file: String(raw.job_file ?? ""),
    instruction_file: String(raw.instruction_file ?? ""),
    knowledge_files: Array.isArray(raw.knowledge_files)
      ? raw.knowledge_files.map((value) => String(value ?? "")).filter(Boolean)
      : undefined,
    policy_files: Array.isArray(raw.policy_files)
      ? raw.policy_files.map((value) => String(value ?? "")).filter(Boolean)
      : undefined,
    edit: raw.edit === true,
    pass_previous_response: raw.pass_previous_response !== false,
    output_contracts: outputContracts?.report ? { report: outputContracts.report } : undefined,
    rules,
  };
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = String(item ?? "");
  }
  return result;
}

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
    sourcePath: absolutePath,
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

export function loadOperationByName(operationName: string, language: string): OperationDefinition {
  const root = getProjectRoot();
  const languagePath = join(root, "builtins", language, "operations", `${operationName}.yaml`);
  if (existsSync(languagePath)) {
    return loadOperationFromFile(languagePath);
  }

  if (language !== "en") {
    const fallbackPath = join(root, "builtins", "en", "operations", `${operationName}.yaml`);
    if (existsSync(fallbackPath)) {
      return loadOperationFromFile(fallbackPath);
    }
  }

  throw new Error(`Operation not found: ${operationName}`);
}

export function listAvailableOperations(language: string): string[] {
  const root = getProjectRoot();
  const names = new Set<string>();

  for (const currentLanguage of [language, "en"]) {
    const directory = join(root, "builtins", currentLanguage, "operations");
    if (!existsSync(directory)) {
      continue;
    }

    for (const file of readdirSync(directory)) {
      if (file.endsWith(".yaml") || file.endsWith(".yml")) {
        names.add(basename(file).replace(/\.ya?ml$/, ""));
      }
    }
  }

  return [...names];
}

export function resolveOperationFacetPath(operationFilePath: string, relativePath: string): string {
  return resolve(dirname(operationFilePath), relativePath);
}