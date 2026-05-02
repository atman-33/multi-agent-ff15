import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { isMissionPrimaryAgentId } from "@/lib/agent-identity";
import { getProjectRoot } from "@/lib/get-project-root.server";
import type {
  ContentSource,
  DelegationDefinition,
  FileContentSource,
  OperationDefinition,
  ReportOutputContractDefinition,
  RuleDefinition,
  StepDefinition,
} from "./types";

function normalizeStepAgent(raw: unknown, stepName: string): StepDefinition["agent"] {
  const value = typeof raw === "string" ? raw.trim() : "";
  const agent = value || "noctis";

  if (
    agent !== "noctis" &&
    agent !== "lunafreya" &&
    agent !== "ignis" &&
    agent !== "gladiolus" &&
    agent !== "prompto"
  ) {
    throw new Error(
      `Operation step "${stepName}" field "agent" must be one of noctis, lunafreya, ignis, gladiolus, or prompto.`,
    );
  }

  return agent;
}

const CONTENT_SOURCE_KEYS = new Set(["file", "inline"]);
const OUTPUT_CONTRACT_KEYS = new Set(["report"]);
const OUTPUT_CONTRACT_REPORT_KEYS = new Set(["name", "format"]);
const DELEGATION_KEYS = new Set([
  "allowed_workers",
  "worker_job",
  "worker_instruction",
  "worker_skills",
  "worker_policies",
]);
const STEP_KEYS = new Set([
  "name",
  "agent",
  "job",
  "instruction",
  "skills",
  "policies",
  "output_contracts",
  "delegation",
  "rules",
]);
const OPERATION_KEYS = new Set([
  "name",
  "description",
  "initial_step",
  "jobs",
  "instructions",
  "skills",
  "policies",
  "steps",
]);
const RULE_KEYS = new Set(["condition", "next"]);

function assertNoUnexpectedKeys(
  record: Record<string, unknown>,
  fieldLabel: string,
  allowedKeys: ReadonlySet<string>,
  guidance: string,
): void {
  const unexpectedKeys = Object.keys(record).filter((key) => !allowedKeys.has(key));
  if (unexpectedKeys.length === 0) {
    return;
  }

  throw new Error(
    `${fieldLabel} contains unexpected field(s): ${unexpectedKeys.join(", ")}. ${guidance}`,
  );
}

const OUTPUT_PLACEHOLDER_PATTERN =
  /\{\{\s*output\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)\s*\}\}/g;
const SETTING_PLACEHOLDER_PATTERN =
  /\{\{\s*setting\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)\s*\}\}/g;
const ROOT_PLACEHOLDER_PATTERN = /\{\{\s*root\(\s*"([^"]+)"\s*\)\s*\}\}/g;

function collectOutputPlaceholders(content: string): Array<{
  stepName: string;
  selector: string;
  fileName: string;
}> {
  if (!content.includes("{{")) {
    return [];
  }

  const matches: Array<{ stepName: string; selector: string; fileName: string }> = [];
  for (const match of content.matchAll(OUTPUT_PLACEHOLDER_PATTERN)) {
    matches.push({
      stepName: match[1],
      selector: match[2],
      fileName: match[3],
    });
  }

  return matches;
}

function validatePlaceholderSyntax(content: string, fieldLabel: string): void {
  if (content.includes("{{ output(")) {
    const matches = Array.from(content.matchAll(OUTPUT_PLACEHOLDER_PATTERN));
    const malformed = content.includes("{{ output(") && matches.length === 0;
    if (malformed) {
      throw new Error(
        `${fieldLabel} contains invalid output placeholder syntax. Use {{ output("step", "selector", "file") }}.`,
      );
    }
  }

  if (content.includes("{{ setting(")) {
    const matches = Array.from(content.matchAll(SETTING_PLACEHOLDER_PATTERN));
    if (matches.length === 0) {
      throw new Error(
        `${fieldLabel} contains invalid setting placeholder syntax. Use {{ setting("key", "mode") }}.`,
      );
    }
    for (const match of matches) {
      if (match[1] !== "language") {
        throw new Error(`${fieldLabel} contains unsupported setting placeholder key "${match[1]}".`);
      }
      if (match[2] !== "name") {
        throw new Error(
          `${fieldLabel} contains unsupported setting placeholder mode "${match[2]}" for key "${match[1]}".`,
        );
      }
    }
  }

  if (content.includes("{{ root(")) {
    const matches = Array.from(content.matchAll(ROOT_PLACEHOLDER_PATTERN));
    if (matches.length === 0) {
      throw new Error(
        `${fieldLabel} contains invalid root placeholder syntax. Use {{ root("scope") }}.`,
      );
    }
    for (const match of matches) {
      if (match[1] !== "app_root" && match[1] !== "execution_root") {
        throw new Error(`${fieldLabel} contains unsupported root placeholder scope "${match[1]}".`);
      }
    }
  }
}

function validateOutputPlaceholderReferences(
  content: string,
  fieldLabel: string,
  declaredOutputsByStep: ReadonlyMap<string, ReadonlySet<string>>,
): void {
  validatePlaceholderSyntax(content, fieldLabel);

  for (const placeholder of collectOutputPlaceholders(content)) {
    const declaredFiles = declaredOutputsByStep.get(placeholder.stepName);
    if (!declaredFiles) {
      throw new Error(
        `${fieldLabel} references unknown output step "${placeholder.stepName}" via output("${placeholder.stepName}", "${placeholder.selector}", "${placeholder.fileName}").`,
      );
    }

    if (!declaredFiles.has(placeholder.fileName)) {
      throw new Error(
        `${fieldLabel} references undeclared output file "${placeholder.fileName}" for step "${placeholder.stepName}". Declare it in output_contracts.report or fix the placeholder.`,
      );
    }
  }
}

function validateOperationPlaceholders(steps: StepDefinition[]): void {
  const declaredOutputsByStep = new Map<string, ReadonlySet<string>>(
    steps.map((step) => [
      step.name,
      new Set((step.output_contracts?.report ?? []).map((report) => report.name)),
    ]),
  );

  for (const step of steps) {
    if (step.instruction && "inline" in step.instruction && typeof step.instruction.inline === "string") {
      validateOutputPlaceholderReferences(
        step.instruction.inline,
        `Operation step "${step.name}" field "instruction"`,
        declaredOutputsByStep,
      );
    }
  }
}

function normalizeAllowedWorkers(raw: unknown, fieldLabel: string): DelegationDefinition["allowed_workers"] {
  if (raw === undefined || raw === null) {
    return [];
  }

  if (!Array.isArray(raw)) {
    throw new Error(`${fieldLabel} must be an array of worker agent IDs.`);
  }

  return raw.map((item, index) => {
    const value = typeof item === "string" ? item.trim() : "";
    if (value !== "ignis" && value !== "gladiolus" && value !== "prompto") {
      throw new Error(`${fieldLabel}[${index}] must be one of ignis, gladiolus, or prompto.`);
    }
    return value;
  });
}

function normalizeContentSource(raw: unknown, fieldLabel: string): ContentSource {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${fieldLabel} must be an object with exactly one of "file" or "inline".`);
  }

  const record = raw as Record<string, unknown>;
  assertNoUnexpectedKeys(
    record,
    fieldLabel,
    CONTENT_SOURCE_KEYS,
    'Content sources support only "file" or "inline". Check indentation so sibling step fields are not nested inside the source object.',
  );
  const file = typeof record.file === "string" ? record.file.trim() : "";
  const inline = typeof record.inline === "string" ? record.inline : "";
  const hasFile = file.length > 0;
  const hasInline = inline.trim().length > 0;

  if (hasFile === hasInline) {
    throw new Error(`${fieldLabel} must define exactly one of "file" or "inline".`);
  }

  return hasFile ? { file } : { inline };
}

function normalizeOptionalContentSource(raw: unknown, fieldLabel: string): ContentSource | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  return normalizeContentSource(raw, fieldLabel);
}

function normalizeContentSourceList(raw: unknown, fieldLabel: string): ContentSource[] | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (!Array.isArray(raw)) {
    throw new Error(`${fieldLabel} must be an array of content source objects.`);
  }

  return raw.map((item, index) => normalizeContentSource(item, `${fieldLabel}[${index}]`));
}

function normalizeFileContentSource(raw: unknown, fieldLabel: string): FileContentSource {
  const source = normalizeContentSource(raw, fieldLabel);

  if ("inline" in source) {
    throw new Error(`${fieldLabel} must define "file". Workflow skills are file-only.`);
  }

  return source;
}

function normalizeFileContentSourceList(raw: unknown, fieldLabel: string): FileContentSource[] | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (!Array.isArray(raw)) {
    throw new Error(`${fieldLabel} must be an array of file source objects.`);
  }

  return raw.map((item, index) => normalizeFileContentSource(item, `${fieldLabel}[${index}]`));
}

function normalizeOutputContractReport(
  raw: unknown,
  stepName: string,
  index: number,
): ReportOutputContractDefinition {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `Operation step "${stepName}" output_contracts.report[${index}] must be an object.`,
    );
  }

  const record = raw as Record<string, unknown>;
  if ("format_file" in record) {
    throw new Error(
      `Operation step "${stepName}" output_contracts.report[${index}] contains removed field "format_file". Use "format: { file: ... }" or "format: { inline: ... }" instead.`,
    );
  }

  assertNoUnexpectedKeys(
    record,
    `Operation step "${stepName}" output_contracts.report[${index}]`,
    OUTPUT_CONTRACT_REPORT_KEYS,
    'Output contract report entries support only "name" and "format".',
  );

  const name = String(record.name ?? "").trim();
  if (!name) {
    throw new Error(
      `Operation step "${stepName}" output_contracts.report[${index}] must define "name".`,
    );
  }

  return {
    name,
    format: normalizeContentSource(
      record.format,
      `Operation step "${stepName}" output_contracts.report[${index}].format`,
    ),
  };
}

function normalizeOutputContracts(
  raw: unknown,
  stepName: string,
): StepDefinition["output_contracts"] | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Operation step "${stepName}" output_contracts must be an object.`);
  }

  const record = raw as Record<string, unknown>;
  assertNoUnexpectedKeys(
    record,
    `Operation step "${stepName}" output_contracts`,
    OUTPUT_CONTRACT_KEYS,
    'Step output_contracts currently supports only the "report" field.',
  );

  const report = record.report;
  if (report === undefined) {
    return undefined;
  }

  if (!Array.isArray(report)) {
    throw new Error(`Operation step "${stepName}" output_contracts.report must be an array.`);
  }

  return {
    report: report.map((item, index) => normalizeOutputContractReport(item, stepName, index)),
  };
}

function normalizeDelegation(
  raw: unknown,
  stepName: string,
  agent: StepDefinition["agent"],
): StepDefinition["delegation"] | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Operation step "${stepName}" delegation must be an object.`);
  }

  if (agent !== "noctis") {
    throw new Error(`Operation step "${stepName}" delegation requires agent: noctis.`);
  }

  const record = raw as Record<string, unknown>;
  assertNoUnexpectedKeys(
    record,
    `Operation step "${stepName}" delegation`,
    DELEGATION_KEYS,
    'Delegation supports only allowed_workers, worker_job, worker_instruction, worker_skills, and worker_policies.',
  );
  return {
    allowed_workers: normalizeAllowedWorkers(
      record.allowed_workers,
      `Operation step "${stepName}" delegation.allowed_workers`,
    ),
    worker_job: normalizeOptionalContentSource(
      record.worker_job,
      `Operation step "${stepName}" delegation.worker_job`,
    ),
    worker_instruction: normalizeOptionalContentSource(
      record.worker_instruction,
      `Operation step "${stepName}" delegation.worker_instruction`,
    ),
    worker_skills: normalizeFileContentSourceList(
      record.worker_skills,
      `Operation step "${stepName}" delegation.worker_skills`,
    ),
    worker_policies: normalizeContentSourceList(
      record.worker_policies,
      `Operation step "${stepName}" delegation.worker_policies`,
    ),
  };
}

function normalizeStep(raw: Record<string, unknown>): StepDefinition {
  const stepName = String(raw.name ?? "");
  validateNoLegacyStepFields(raw, stepName);
  assertNoUnexpectedKeys(
    raw,
    `Operation step "${stepName || "(unnamed)"}"`,
    STEP_KEYS,
    'Steps support only name, agent, job, instruction, skills, policies, output_contracts, delegation, and rules.',
  );
  const agent = normalizeStepAgent(raw.agent, stepName);

  const rules = Array.isArray(raw.rules)
    ? (raw.rules as Record<string, unknown>[]).map((rule, index): RuleDefinition => {
        assertNoUnexpectedKeys(
          rule,
          `Operation step "${stepName}" rules[${index}]`,
          RULE_KEYS,
          'Rules support only "condition" and "next".',
        );
        return {
          condition: String(rule.condition ?? ""),
          next: String(rule.next ?? ""),
        };
      })
    : [];

  return {
    name: stepName,
    agent,
    job: normalizeOptionalContentSource(raw.job, `Operation step "${stepName}" field "job"`),
    instruction: normalizeOptionalContentSource(
      raw.instruction,
      `Operation step "${stepName}" field "instruction"`,
    ),
    skills: normalizeFileContentSourceList(
      raw.skills,
      `Operation step "${stepName}" field "skills"`,
    ),
    policies: normalizeContentSourceList(
      raw.policies,
      `Operation step "${stepName}" field "policies"`,
    ),
    output_contracts: normalizeOutputContracts(raw.output_contracts, stepName),
    delegation: normalizeDelegation(raw.delegation, stepName, agent),
    rules,
  };
}

function validateNoLegacyOperationFields(raw: Record<string, unknown>): void {
  const removedFields = ["initial_movement", "movements", "max_movements", "handoff_mode"].filter(
    (field) => field in raw,
  );

  if (removedFields.length > 0) {
    throw new Error(
      `Operation schema contains removed field(s): ${removedFields.join(", ")}. Use "initial_step" and explicit Noctis-owned steps instead.`,
    );
  }
}

function validateNoLegacyStepFields(raw: Record<string, unknown>, stepName: string): void {
  const label = stepName || "(unnamed)";

  if ("edit" in raw) {
    throw new Error(
      `Operation step "${label}" contains removed field "edit". Remove it from the schema.`,
    );
  }

  if ("handoff_mode" in raw) {
    throw new Error(
      `Operation step "${label}" contains removed field "handoff_mode". Model pauses or approvals as explicit Noctis-owned steps instead.`,
    );
  }

  if ("pass_previous_response" in raw) {
    throw new Error(
      `Operation step "${label}" contains removed field "pass_previous_response". Previous step output is no longer injected by the operation runtime.`,
    );
  }

  const removedFieldMessages: Record<string, string> = {
    job_file: 'Use "job: { file: ... }" or "job: { inline: ... }" instead.',
    instruction_file:
      'Use "instruction: { file: ... }" or "instruction: { inline: ... }" instead.',
    knowledge: 'Use "skills:" with a list of file source objects instead.',
    knowledge_files: 'Use "skills:" with a list of file source objects instead.',
    policy_files: 'Use "policies:" with a list of content source objects instead.',
  };

  for (const [field, guidance] of Object.entries(removedFieldMessages)) {
    if (field in raw) {
      throw new Error(`Operation step "${label}" contains removed field "${field}". ${guidance}`);
    }
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

function loadOperationFromRecord(
  raw: Record<string, unknown>,
  absolutePath: string,
): OperationDefinition {
  validateNoLegacyOperationFields(raw);
  assertNoUnexpectedKeys(
    raw,
    "Operation schema",
    OPERATION_KEYS,
    'Operations support only name, description, initial_step, jobs, instructions, skills, policies, and steps.',
  );

  const initialStep = String(raw.initial_step ?? "").trim();
  if (!initialStep) {
    throw new Error(`Operation schema must define "initial_step": ${absolutePath}`);
  }

  if (!Array.isArray(raw.steps)) {
    throw new Error(`Operation schema must define "steps" as an array: ${absolutePath}`);
  }

  const steps = (raw.steps as Record<string, unknown>[]).map(normalizeStep);
  validateOperationPlaceholders(steps);
  const initialStepDefinition = steps.find((step) => step.name === initialStep);

  if (!initialStepDefinition) {
    throw new Error(`Operation initial_step must reference a defined step: ${absolutePath}`);
  }

  if (!isMissionPrimaryAgentId(initialStepDefinition.agent)) {
    throw new Error(
      `Operation initial_step must be assigned to a primary mission agent: ${absolutePath}`,
    );
  }

  const terminalInitialRule = initialStepDefinition.rules.find(
    (rule) => rule.next === "ABORT" || rule.next === "COMPLETE",
  );

  if (terminalInitialRule) {
    throw new Error(
      `Operation initial_step rules must not use terminal next values ABORT or COMPLETE: ${absolutePath}`,
    );
  }

  return {
    sourcePath: absolutePath,
    name: String(raw.name ?? ""),
    description: String(raw.description ?? ""),
    initial_step: initialStep,
    jobs: toStringRecord(raw.jobs),
    instructions: toStringRecord(raw.instructions),
    skills: toStringRecord(raw.skills),
    policies: toStringRecord(raw.policies),
    steps,
  };
}

export function loadOperationFromText(content: string, absolutePath: string): OperationDefinition {
  const raw = parseYaml(content);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Operation schema must be a mapping object: ${absolutePath}`);
  }

  return loadOperationFromRecord(raw as Record<string, unknown>, absolutePath);
}

export function loadOperationFromFile(absolutePath: string): OperationDefinition {
  if (!existsSync(absolutePath)) {
    throw new Error(`Operation file not found: ${absolutePath}`);
  }

  const content = readFileSync(absolutePath, "utf-8");
  return loadOperationFromText(content, absolutePath);
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