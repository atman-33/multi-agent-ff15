#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, relative, resolve } from "node:path";
import process from "node:process";

const require = createRequire(new URL("../../../../web/package.json", import.meta.url));

let parseYaml;

try {
  ({ parse: parseYaml } = require("yaml"));
} catch {
  console.error("Unable to load the yaml package from web dependencies. Run `npm run web:install` first.");
  process.exit(1);
}

const VALID_AGENTS = new Set(["noctis", "ignis", "gladiolus", "prompto"]);
const TERMINAL_NEXT = new Set(["ABORT", "COMPLETE"]);
const LEGACY_OPERATION_FIELDS = ["initial_movement", "movements", "max_movements", "handoff_mode"];
const LEGACY_STEP_FIELD_MESSAGES = {
  edit: 'contains removed field "edit".',
  handoff_mode: 'contains removed field "handoff_mode".',
  pass_previous_response: 'contains removed field "pass_previous_response".',
  job_file: 'contains removed field "job_file". Use "job: { file: ... }" or "job: { inline: ... }" instead.',
  instruction_file:
    'contains removed field "instruction_file". Use "instruction: { file: ... }" or "instruction: { inline: ... }" instead.',
  knowledge:
    'contains removed field "knowledge". Use "skills:" with a list of file source objects instead.',
  knowledge_files:
    'contains removed field "knowledge_files". Use "skills:" with a list of file source objects instead.',
  policy_files:
    'contains removed field "policy_files". Use "policies:" with a list of source objects instead.',
};

function printUsage() {
  console.log("Usage: node .opencode/skills/operation-customization/scripts/validate-operation-yaml.mjs <file-or-directory> [...more-paths]");
}

function toDisplayPath(filePath) {
  const rel = relative(process.cwd(), filePath);
  return rel && !rel.startsWith("..") ? rel : filePath;
}

function collectYamlFiles(inputPaths) {
  const files = [];

  for (const inputPath of inputPaths) {
    const resolvedPath = resolve(process.cwd(), inputPath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Path does not exist: ${inputPath}`);
    }

    const stats = statSync(resolvedPath);
    if (stats.isDirectory()) {
      walkDirectory(resolvedPath, files);
      continue;
    }

    if (isYamlFile(resolvedPath)) {
      files.push(resolvedPath);
    }
  }

  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
}

function walkDirectory(directoryPath, files) {
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const childPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(childPath, files);
      continue;
    }

    if (isYamlFile(childPath)) {
      files.push(childPath);
    }
  }
}

function isYamlFile(filePath) {
  const extension = extname(filePath).toLowerCase();
  return extension === ".yaml" || extension === ".yml";
}

function pushError(errors, message) {
  errors.push(message);
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateContentSource(raw, label, operationDirectory, errors) {
  if (raw === undefined || raw === null) {
    return;
  }

  if (!isPlainObject(raw)) {
    pushError(errors, `${label} must be an object with exactly one of "file" or "inline".`);
    return;
  }

  const record = raw;
  const file = typeof record.file === "string" ? record.file.trim() : "";
  const inline = typeof record.inline === "string" ? record.inline.trim() : "";
  const hasFile = file.length > 0;
  const hasInline = inline.length > 0;

  if (hasFile === hasInline) {
    pushError(errors, `${label} must define exactly one of "file" or "inline".`);
    return;
  }

  if (hasFile) {
    const resolvedSourcePath = resolve(operationDirectory, file);
    if (!existsSync(resolvedSourcePath)) {
      pushError(errors, `${label} file source does not exist: ${file}`);
    }
  }
}

function validateContentSourceList(raw, label, operationDirectory, errors) {
  if (raw === undefined || raw === null) {
    return;
  }

  if (!Array.isArray(raw)) {
    pushError(errors, `${label} must be an array of source objects.`);
    return;
  }

  raw.forEach((entry, index) => {
    validateContentSource(entry, `${label}[${index}]`, operationDirectory, errors);
  });
}

function validateFileContentSource(raw, label, operationDirectory, errors) {
  if (raw === undefined || raw === null) {
    return;
  }

  if (!isPlainObject(raw)) {
    pushError(errors, `${label} must be an object with "file".`);
    return;
  }

  const record = raw;
  const file = typeof record.file === "string" ? record.file.trim() : "";
  const inline = typeof record.inline === "string" ? record.inline.trim() : "";

  if (!file || inline) {
    pushError(errors, `${label} must define exactly one "file" source. Workflow skills are file-only.`);
    return;
  }

  const resolvedSourcePath = resolve(operationDirectory, file);
  if (!existsSync(resolvedSourcePath)) {
    pushError(errors, `${label} file source does not exist: ${file}`);
  }
}

function validateFileContentSourceList(raw, label, operationDirectory, errors) {
  if (raw === undefined || raw === null) {
    return;
  }

  if (!Array.isArray(raw)) {
    pushError(errors, `${label} must be an array of file source objects.`);
    return;
  }

  raw.forEach((entry, index) => {
    validateFileContentSource(entry, `${label}[${index}]`, operationDirectory, errors);
  });
}

function validateDelegation(raw, stepName, agent, operationDirectory, errors) {
  if (raw === undefined || raw === null) {
    return false;
  }

  if (!isPlainObject(raw)) {
    pushError(errors, `Step "${stepName}" delegation must be an object.`);
    return false;
  }

  if (agent !== "noctis") {
    pushError(errors, `Step "${stepName}" delegation is only allowed on noctis steps.`);
  }

  const record = raw;
  if ("worker_knowledge" in record) {
    pushError(
      errors,
      `Step "${stepName}" delegation contains removed field "worker_knowledge". Use "worker_skills:" with a list of file source objects instead.`,
    );
  }

  if (record.allowed_workers !== undefined && record.allowed_workers !== null) {
    if (!Array.isArray(record.allowed_workers)) {
      pushError(errors, `Step "${stepName}" delegation.allowed_workers must be an array.`);
    } else {
      record.allowed_workers.forEach((worker, index) => {
        if (typeof worker !== "string" || !VALID_AGENTS.has(worker) || worker === "noctis") {
          pushError(
            errors,
            `Step "${stepName}" delegation.allowed_workers[${index}] must be one of ignis, gladiolus, or prompto.`,
          );
        }
      });
    }
  }

  validateContentSource(record.worker_job, `Step "${stepName}" delegation.worker_job`, operationDirectory, errors);
  validateContentSource(
    record.worker_instruction,
    `Step "${stepName}" delegation.worker_instruction`,
    operationDirectory,
    errors,
  );
  validateFileContentSourceList(
    record.worker_skills,
    `Step "${stepName}" delegation.worker_skills`,
    operationDirectory,
    errors,
  );
  validateContentSourceList(
    record.worker_policies,
    `Step "${stepName}" delegation.worker_policies`,
    operationDirectory,
    errors,
  );

  return true;
}

function validateOutputContracts(raw, stepName, operationDirectory, errors) {
  if (raw === undefined || raw === null) {
    return;
  }

  if (!isPlainObject(raw)) {
    pushError(errors, `Step "${stepName}" output_contracts must be an object.`);
    return;
  }

  const report = raw.report;
  if (report === undefined || report === null) {
    return;
  }

  if (!Array.isArray(report)) {
    pushError(errors, `Step "${stepName}" output_contracts.report must be an array.`);
    return;
  }

  report.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      pushError(errors, `Step "${stepName}" output_contracts.report[${index}] must be an object.`);
      return;
    }

    if ("format_file" in entry) {
      pushError(
        errors,
        `Step "${stepName}" output_contracts.report[${index}] contains removed field "format_file". Use "format: { file: ... }" or "format: { inline: ... }" instead.`,
      );
    }

    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name) {
      pushError(errors, `Step "${stepName}" output_contracts.report[${index}] must define "name".`);
    }

    validateContentSource(
      entry.format,
      `Step "${stepName}" output_contracts.report[${index}].format`,
      operationDirectory,
      errors,
    );
  });
}

function validateRules(raw, stepName, hasDelegation, agent, errors) {
  if (raw === undefined || raw === null) {
    if (!(agent === "noctis" && hasDelegation)) {
      pushError(
        errors,
        `Step "${stepName}" may omit rules only for an explicit noctis-owned autonomous delegation step.`,
      );
    }
    return [];
  }

  if (!Array.isArray(raw)) {
    pushError(errors, `Step "${stepName}" rules must be an array.`);
    return [];
  }

  return raw.flatMap((rule, index) => {
    if (!isPlainObject(rule)) {
      pushError(errors, `Step "${stepName}" rules[${index}] must be an object.`);
      return [];
    }

    const condition = typeof rule.condition === "string" ? rule.condition.trim() : "";
    const next = typeof rule.next === "string" ? rule.next.trim() : "";

    if (!condition) {
      pushError(errors, `Step "${stepName}" rules[${index}] must define a non-empty condition.`);
    }

    if (!next) {
      pushError(errors, `Step "${stepName}" rules[${index}] must define a non-empty next target.`);
      return [];
    }

    return [next];
  });
}

function validateOperationFile(filePath) {
  const operationDirectory = dirname(filePath);
  const errors = [];
  let raw;

  try {
    raw = parseYaml(readFileSync(filePath, "utf-8"));
  } catch (error) {
    pushError(errors, `YAML parse failed: ${error instanceof Error ? error.message : String(error)}`);
    return errors;
  }

  if (!isPlainObject(raw)) {
    pushError(errors, "Operation file must parse to an object.");
    return errors;
  }

  for (const field of LEGACY_OPERATION_FIELDS) {
    if (field in raw) {
      pushError(errors, `Operation contains removed field "${field}".`);
    }
  }

  const initialStep = typeof raw.initial_step === "string" ? raw.initial_step.trim() : "";
  if (!initialStep) {
    pushError(errors, 'Operation must define a non-empty "initial_step".');
  }

  if (!Array.isArray(raw.steps)) {
    pushError(errors, 'Operation must define "steps" as an array.');
    return errors;
  }

  const stepNames = new Set();
  const stepAgents = new Map();
  const stepRuleTargets = new Map();

  raw.steps.forEach((step, index) => {
    if (!isPlainObject(step)) {
      pushError(errors, `steps[${index}] must be an object.`);
      return;
    }

    const stepName = typeof step.name === "string" ? step.name.trim() : "";
    if (!stepName) {
      pushError(errors, `steps[${index}] must define a non-empty name.`);
      return;
    }

    if (stepNames.has(stepName)) {
      pushError(errors, `Duplicate step name: "${stepName}".`);
    }
    stepNames.add(stepName);

    const agent = typeof step.agent === "string" ? step.agent.trim() : "";
    if (!VALID_AGENTS.has(agent)) {
      pushError(errors, `Step "${stepName}" agent must be one of noctis, ignis, gladiolus, or prompto.`);
    }
    stepAgents.set(stepName, agent);

    for (const [field, message] of Object.entries(LEGACY_STEP_FIELD_MESSAGES)) {
      if (field in step) {
        pushError(errors, `Step "${stepName}" ${message}`);
      }
    }

    validateContentSource(step.job, `Step "${stepName}" job`, operationDirectory, errors);
    validateContentSource(
      step.instruction,
      `Step "${stepName}" instruction`,
      operationDirectory,
      errors,
    );
    validateFileContentSourceList(step.skills, `Step "${stepName}" skills`, operationDirectory, errors);
    validateContentSourceList(step.policies, `Step "${stepName}" policies`, operationDirectory, errors);
    validateOutputContracts(step.output_contracts, stepName, operationDirectory, errors);

    const hasDelegation = validateDelegation(
      step.delegation,
      stepName,
      agent,
      operationDirectory,
      errors,
    );
    const ruleTargets = validateRules(step.rules, stepName, hasDelegation, agent, errors);
    stepRuleTargets.set(stepName, ruleTargets);
  });

  if (initialStep) {
    if (!stepNames.has(initialStep)) {
      pushError(errors, `initial_step references an undefined step: "${initialStep}".`);
    } else {
      const initialAgent = stepAgents.get(initialStep);
      if (initialAgent !== "noctis") {
        pushError(errors, `initial_step "${initialStep}" must be owned by noctis.`);
      }

      for (const next of stepRuleTargets.get(initialStep) ?? []) {
        if (TERMINAL_NEXT.has(next)) {
          pushError(
            errors,
            `initial_step "${initialStep}" must not route directly to ${next}. Route through a named non-initial step instead.`,
          );
        }
      }
    }
  }

  for (const [stepName, targets] of stepRuleTargets.entries()) {
    for (const next of targets) {
      if (TERMINAL_NEXT.has(next)) {
        continue;
      }

      if (!stepNames.has(next)) {
        pushError(errors, `Step "${stepName}" routes to an undefined next target: "${next}".`);
      }
    }
  }

  return errors;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  let files;
  try {
    files = collectYamlFiles(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (files.length === 0) {
    console.error("No YAML files found in the provided paths.");
    process.exit(1);
  }

  let hasErrors = false;
  for (const filePath of files) {
    const errors = validateOperationFile(filePath);
    if (errors.length === 0) {
      console.log(`OK ${toDisplayPath(filePath)}`);
      continue;
    }

    hasErrors = true;
    console.error(`ERROR ${toDisplayPath(filePath)}`);
    for (const message of errors) {
      console.error(`  - ${message}`);
    }
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.log(`Validated ${files.length} operation YAML file(s).`);
}

main();