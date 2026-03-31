import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { getProjectRoot } from "@/lib/get-project-root.server";
import type { HandoffMode, OperationDefinition, RuleDefinition, StepDefinition } from "./types";

function normalizeHandoffMode(
  value: unknown,
  location: string,
): HandoffMode | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "auto" || value === "manual") {
    return value;
  }

  throw new Error(
    `Operation schema contains invalid handoff_mode at ${location}: expected "auto" or "manual".`,
  );
}

function normalizeStep(raw: Record<string, unknown>): StepDefinition {
  validateNoLegacyStepFields(raw, String(raw.name ?? ""));

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
    agent: String(raw.agent ?? "noctis") as StepDefinition["agent"],
    handoff_mode: normalizeHandoffMode(raw.handoff_mode, `step "${String(raw.name ?? "") || "(unnamed)"}"`),
    job_file: String(raw.job_file ?? ""),
    instruction_file: String(raw.instruction_file ?? ""),
    knowledge_files: Array.isArray(raw.knowledge_files)
      ? raw.knowledge_files.map((value) => String(value ?? "")).filter(Boolean)
      : undefined,
    policy_files: Array.isArray(raw.policy_files)
      ? raw.policy_files.map((value) => String(value ?? "")).filter(Boolean)
      : undefined,
    pass_previous_response: raw.pass_previous_response !== false,
    output_contracts: outputContracts?.report ? { report: outputContracts.report } : undefined,
    rules,
  };
}

function validateNoLegacyOperationFields(raw: Record<string, unknown>): void {
  const removedFields = ["initial_movement", "movements", "max_movements"].filter(
    (field) => field in raw,
  );

  if (removedFields.length > 0) {
    throw new Error(
      `Operation schema contains removed field(s): ${removedFields.join(", ")}. Use "initial_step" and "steps" instead.`,
    );
  }
}

function validateNoLegacyStepFields(raw: Record<string, unknown>, stepName: string): void {
  if ("edit" in raw) {
    const label = stepName || "(unnamed)";
    throw new Error(
      `Operation step "${label}" contains removed field "edit". Remove it from the schema.`,
    );
  }
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

  validateNoLegacyOperationFields(raw);

  const initialStep = String(raw.initial_step ?? "").trim();
  if (!initialStep) {
    throw new Error(`Operation schema must define "initial_step": ${absolutePath}`);
  }

  if (!Array.isArray(raw.steps)) {
    throw new Error(`Operation schema must define "steps" as an array: ${absolutePath}`);
  }

  const steps = (raw.steps as Record<string, unknown>[]).map(normalizeStep);

  return {
    sourcePath: absolutePath,
    name: String(raw.name ?? ""),
    description: String(raw.description ?? ""),
    initial_step: initialStep,
    handoff_mode: normalizeHandoffMode(raw.handoff_mode, "operation root") ?? "manual",
    jobs: toStringRecord(raw.jobs),
    instructions: toStringRecord(raw.instructions),
    knowledge: toStringRecord(raw.knowledge),
    policies: toStringRecord(raw.policies),
    steps,
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