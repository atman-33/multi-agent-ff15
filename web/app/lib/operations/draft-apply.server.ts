import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { stringify } from "yaml";
import {
  buildBuiltinOperationRef,
  buildProjectOperationRef,
} from "@/lib/operation-definition/operation-catalog";
import { readOperationLanguage } from "@/lib/operation-definition/language";
import { loadOperationFromText } from "@/lib/operation-definition/operation-loader";
import type {
  ContentSource,
  DelegationDefinition,
  FileContentSource,
  OperationDefinition,
  ReportOutputContractDefinition,
  RuleDefinition,
  StepDefinition,
} from "@/lib/operation-definition/types";
import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  getProjectAuthoringDirectory,
  readRegisteredProjectDefinition,
} from "@/lib/project-config.server";
import type { OperationsAuthoringTarget } from "./types";

type OperationRefParts =
  | { kind: "builtin"; language: string; fileName: string }
  | { kind: "project"; projectId: string; fileName: string };

export interface OperationsDraftChange {
  action: "write" | "delete";
  path: string;
}

export interface OperationsDraftApplyInput {
  sourceOperationRef?: string | null;
  target: OperationsAuthoringTarget;
  operation: OperationDefinition;
  root?: string;
}

export interface OperationsDraftApplyPlan {
  changes: OperationsDraftChange[];
  operation: OperationDefinition;
  operationName: string;
  operationRef: string;
  yaml: string;
}

const SAFE_OPERATION_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function serializeContentSource(source: ContentSource): { file: string } | { inline: string } {
  if (typeof source.file === "string") {
    return { file: source.file };
  }

  return { inline: source.inline };
}

function serializeFileContentSource(source: FileContentSource): { file: string } {
  return { file: source.file };
}

function serializeReportOutputContract(report: ReportOutputContractDefinition): Record<string, unknown> {
  return {
    name: report.name,
    format: serializeContentSource(report.format),
  };
}

function serializeDelegation(delegation: DelegationDefinition): Record<string, unknown> {
  const result: Record<string, unknown> = {
    allowed_workers: delegation.allowed_workers,
  };

  if (delegation.worker_job) {
    result.worker_job = serializeContentSource(delegation.worker_job);
  }
  if (delegation.worker_instruction) {
    result.worker_instruction = serializeContentSource(delegation.worker_instruction);
  }
  if (delegation.worker_skills?.length) {
    result.worker_skills = delegation.worker_skills.map(serializeFileContentSource);
  }
  if (delegation.worker_policies?.length) {
    result.worker_policies = delegation.worker_policies.map(serializeContentSource);
  }

  return result;
}

function serializeRule(rule: RuleDefinition): Record<string, unknown> {
  return {
    condition: rule.condition,
    next: rule.next,
  };
}

function serializeStep(step: StepDefinition): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: step.name,
    agent: step.agent,
  };

  if (step.job) {
    result.job = serializeContentSource(step.job);
  }
  if (step.instruction) {
    result.instruction = serializeContentSource(step.instruction);
  }
  if (step.skills?.length) {
    result.skills = step.skills.map(serializeFileContentSource);
  }
  if (step.policies?.length) {
    result.policies = step.policies.map(serializeContentSource);
  }
  if (step.output_contracts?.report.length) {
    result.output_contracts = {
      report: step.output_contracts.report.map(serializeReportOutputContract),
    };
  }
  if (step.delegation) {
    result.delegation = serializeDelegation(step.delegation);
  }

  result.rules = step.rules.map(serializeRule);
  return result;
}

function serializeOperationDocument(operation: OperationDefinition): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: operation.name,
    description: operation.description,
    initial_step: operation.initial_step,
  };

  if (Object.keys(operation.jobs).length > 0) {
    result.jobs = operation.jobs;
  }
  if (Object.keys(operation.instructions).length > 0) {
    result.instructions = operation.instructions;
  }
  if (Object.keys(operation.skills).length > 0) {
    result.skills = operation.skills;
  }
  if (Object.keys(operation.policies).length > 0) {
    result.policies = operation.policies;
  }

  result.steps = operation.steps.map(serializeStep);
  return result;
}

function serializeOperationYaml(operation: OperationDefinition): string {
  return stringify(serializeOperationDocument(operation), {
    lineWidth: 0,
  });
}

function parseOperationRef(operationRef: string): OperationRefParts {
  const parts = operationRef.split(":");
  if (parts[0] === "builtin" && parts.length === 3) {
    return {
      kind: "builtin",
      language: parts[1],
      fileName: parts[2],
    };
  }

  if (parts[0] === "project" && parts.length === 3) {
    return {
      kind: "project",
      projectId: parts[1],
      fileName: parts[2],
    };
  }

  throw new Error(`Unsupported operation ref: ${operationRef}`);
}

function normalizeOperationName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error("Operation draft must define a non-empty name before apply.");
  }
  if (!SAFE_OPERATION_NAME_PATTERN.test(normalized)) {
    throw new Error(
      "Operation draft name must use only letters, numbers, dots, underscores, or hyphens.",
    );
  }

  return normalized;
}

function resolveBuiltinDestination(root: string, fileName: string, language: string) {
  const directory = join(root, "builtins", language, "operations");
  return {
    path: join(directory, fileName),
    ref: buildBuiltinOperationRef(language, fileName),
  };
}

function resolveProjectDestination(root: string, fileName: string, projectId: string) {
  const project = readRegisteredProjectDefinition(root, projectId);
  if (!project) {
    throw new Error(`Registered project not found for authoring target: ${projectId}`);
  }

  const directory = join(getProjectAuthoringDirectory(root, projectId), "operations");
  return {
    path: join(directory, fileName),
    ref: buildProjectOperationRef(projectId, fileName),
  };
}

function resolveDraftDestination(input: {
  sourceOperationRef?: string | null;
  target: OperationsAuthoringTarget;
  operationName: string;
  root: string;
}): {
  operationRef: string;
  path: string;
  priorPath: string | null;
} {
  const name = normalizeOperationName(input.operationName);

  if (input.sourceOperationRef?.trim()) {
    const source = parseOperationRef(input.sourceOperationRef.trim());
    const extension = extname(source.fileName) || ".yaml";
    const nextFileName = `${name}${extension}`;

    if (source.kind === "builtin") {
      if (input.target.kind !== "builtin") {
        throw new Error("Saved builtin operation drafts must keep a builtin authoring target.");
      }

      const next = resolveBuiltinDestination(input.root, nextFileName, source.language);
      const current = resolveBuiltinDestination(input.root, source.fileName, source.language);
      return {
        operationRef: next.ref,
        path: next.path,
        priorPath: current.path !== next.path ? current.path : null,
      };
    }

    if (input.target.kind !== "project" || input.target.projectId !== source.projectId) {
      throw new Error(
        "Saved project operation drafts must keep the original project authoring target.",
      );
    }

    const next = resolveProjectDestination(input.root, nextFileName, source.projectId);
    const current = resolveProjectDestination(input.root, source.fileName, source.projectId);
    return {
      operationRef: next.ref,
      path: next.path,
      priorPath: current.path !== next.path ? current.path : null,
    };
  }

  const nextFileName = `${name}.yaml`;
  if (input.target.kind === "builtin") {
    const language = readOperationLanguage();
    const next = resolveBuiltinDestination(input.root, nextFileName, language);
    return {
      operationRef: next.ref,
      path: next.path,
      priorPath: null,
    };
  }

  const next = resolveProjectDestination(input.root, nextFileName, input.target.projectId);
  return {
    operationRef: next.ref,
    path: next.path,
    priorPath: null,
  };
}

export function planOperationsDraftApply(
  input: OperationsDraftApplyInput,
): OperationsDraftApplyPlan {
  const root = input.root ?? getProjectRoot();
  const operationName = normalizeOperationName(input.operation.name);
  const destination = resolveDraftDestination({
    sourceOperationRef: input.sourceOperationRef,
    target: input.target,
    operationName,
    root,
  });
  const yaml = serializeOperationYaml({
    ...input.operation,
    name: operationName,
  });
  const validatedOperation = loadOperationFromText(yaml, destination.path);
  const changes: OperationsDraftChange[] = [{ action: "write", path: destination.path }];
  if (destination.priorPath) {
    changes.push({ action: "delete", path: destination.priorPath });
  }

  return {
    changes,
    operation: validatedOperation,
    operationName,
    operationRef: destination.operationRef,
    yaml,
  };
}

export function applyOperationsDraft(
  input: OperationsDraftApplyInput,
): OperationsDraftApplyPlan {
  const plan = planOperationsDraftApply(input);
  const stageDir = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operations-apply-"));
  const backups = new Map<string, { existed: boolean; content: string }>();

  try {
    for (const change of plan.changes) {
      backups.set(change.path, {
        existed: existsSync(change.path),
        content: existsSync(change.path) ? readFileSync(change.path, "utf-8") : "",
      });
    }

    const stagedPath = join(stageDir, basename(plan.changes[0].path));
    writeFileSync(stagedPath, plan.yaml, "utf-8");

    for (const change of plan.changes) {
      if (change.action === "write") {
        mkdirSync(dirname(change.path), { recursive: true });
        writeFileSync(change.path, readFileSync(stagedPath, "utf-8"), "utf-8");
        continue;
      }

      rmSync(change.path, { force: true });
    }

    return plan;
  } catch (error) {
    for (const change of [...plan.changes].reverse()) {
      const backup = backups.get(change.path);
      if (!backup) {
        continue;
      }

      if (!backup.existed) {
        rmSync(change.path, { force: true, recursive: false });
        continue;
      }

      mkdirSync(dirname(change.path), { recursive: true });
      writeFileSync(change.path, backup.content, "utf-8");
    }

    throw error;
  } finally {
    rmSync(stageDir, { force: true, recursive: true });
  }
}