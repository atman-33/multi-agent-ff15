import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  getProjectAuthoringDirectory,
  readRegisteredProjects,
  readRegisteredProjectDefinition,
  type RegisteredProjectDefinition,
} from "@/lib/project-config.server";
import type { ProjectScope } from "@/lib/project-scopes";
import { INTERNAL_AUTONOMOUS_OPERATION_NAME } from "@/lib/operation-runtime/constants";
import { loadOperationFromFile } from "./operation-loader";
import type { OperationDefinition } from "./types";

export type OperationSourceKind = "builtin" | "project";

export interface OperationCatalogEntry {
  description: string;
  isDefault: boolean;
  name: string;
  projectId?: string;
  projectName?: string;
  ref: string;
  sourceKind: OperationSourceKind;
  sourcePath: string;
}

export interface ListOperationCatalogEntriesOptions {
  builtinLanguages: string[];
  projectFilterId?: string;
  root?: string;
  scope: ProjectScope;
}

export function buildBuiltinOperationRef(language: string, fileName: string): string {
  return `builtin:${language}:${fileName}`;
}

export function buildProjectOperationRef(projectId: string, fileName: string): string {
  return `project:${projectId}:${fileName}`;
}

function isOperationFile(fileName: string): boolean {
  return fileName.endsWith(".yaml") || fileName.endsWith(".yml");
}

function listOperationFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory)
    .filter(isOperationFile)
    .sort((left, right) => left.localeCompare(right));
}

function getOperationFileStem(fileName: string): string {
  return basename(fileName).replace(/\.ya?ml$/, "");
}

const USER_FACING_HIDDEN_BUILTIN_OPERATION_NAMES: Record<ProjectScope, readonly string[]> = {
  noctis_team: ["lunafreya-autonomous"],
  lunafreya: ["noctis-autonomous"],
};

function filterUserFacingOperationEntries(
  entries: OperationCatalogEntry[],
  scope: ProjectScope,
): OperationCatalogEntry[] {
  const hiddenNames = USER_FACING_HIDDEN_BUILTIN_OPERATION_NAMES[scope];
  if (hiddenNames.length === 0) {
    return entries;
  }

  return entries.filter(
    (entry) => entry.sourceKind !== "builtin" || !hiddenNames.includes(entry.name),
  );
}

function toCatalogEntry(input: {
  ref: string;
  sourceKind: OperationSourceKind;
  sourcePath: string;
  project?: RegisteredProjectDefinition;
}): OperationCatalogEntry {
  const operation = loadOperationFromFile(input.sourcePath);
  return {
    ref: input.ref,
    name: operation.name,
    description: operation.description,
    sourceKind: input.sourceKind,
    sourcePath: operation.sourcePath,
    isDefault:
      input.sourceKind === "builtin" && operation.name === INTERNAL_AUTONOMOUS_OPERATION_NAME,
    projectId: input.project?.id,
    projectName: input.project?.name,
  };
}

function listBuiltinCatalogEntries(root: string, languages: string[]): OperationCatalogEntry[] {
  const entries: OperationCatalogEntry[] = [];
  const seenFileStems = new Set<string>();

  for (const language of [...new Set(languages.filter((value) => value.trim().length > 0))]) {
    const operationsDirectory = join(root, "builtins", language, "operations");
    for (const fileName of listOperationFiles(operationsDirectory)) {
      const fileStem = getOperationFileStem(fileName);
      if (seenFileStems.has(fileStem)) {
        continue;
      }

      seenFileStems.add(fileStem);
      entries.push(
        toCatalogEntry({
          ref: buildBuiltinOperationRef(language, fileName),
          sourceKind: "builtin",
          sourcePath: join(operationsDirectory, fileName),
        }),
      );
    }
  }

  return entries;
}

function listProjectCatalogEntries(
  root: string,
  _scope: ProjectScope,
  projectFilterId?: string,
): OperationCatalogEntry[] {
  const entries: OperationCatalogEntry[] = [];

  for (const projectEntry of readRegisteredProjects(root)) {
    if (projectFilterId && projectEntry.id !== projectFilterId) {
      continue;
    }

    const project = readRegisteredProjectDefinition(root, projectEntry.id);
    if (!project) {
      continue;
    }

    const operationsDirectory = join(getProjectAuthoringDirectory(root, project.id), "operations");
    for (const fileName of listOperationFiles(operationsDirectory)) {
      entries.push(
        toCatalogEntry({
          ref: buildProjectOperationRef(project.id, fileName),
          sourceKind: "project",
          sourcePath: join(operationsDirectory, fileName),
          project,
        }),
      );
    }
  }

  return entries;
}

export function listOperationCatalogEntriesForScope(
  options: ListOperationCatalogEntriesOptions,
): OperationCatalogEntry[] {
  const root = options.root ?? getProjectRoot();

  return [
    ...listBuiltinCatalogEntries(root, options.builtinLanguages),
    ...listProjectCatalogEntries(root, options.scope, options.projectFilterId),
  ];
}

export function listUserFacingOperationCatalogEntriesForScope(
  options: ListOperationCatalogEntriesOptions,
): OperationCatalogEntry[] {
  return filterUserFacingOperationEntries(
    listOperationCatalogEntriesForScope(options),
    options.scope,
  );
}

function resolveOperationPathFromRef(root: string, operationRef: string): string {
  const parts = operationRef.split(":");

  if (parts[0] === "builtin" && parts.length === 3) {
    const [, language, fileName] = parts;
    return join(root, "builtins", language, "operations", fileName);
  }

  if (parts[0] === "project" && parts.length === 3) {
    const [, projectId, fileName] = parts;
    const definition = readRegisteredProjectDefinition(root, projectId);
    if (!definition) {
      throw new Error(`Project not found for operation ref: ${operationRef}`);
    }

    return join(getProjectAuthoringDirectory(root, projectId), "operations", fileName);
  }

  throw new Error(`Unsupported operation ref: ${operationRef}`);
}

export function loadOperationByRef(operationRef: string, root = getProjectRoot()): OperationDefinition {
  const operationPath = resolveOperationPathFromRef(root, operationRef);
  if (!existsSync(operationPath)) {
    throw new Error(`Operation not found for ref: ${operationRef}`);
  }

  return loadOperationFromFile(operationPath);
}

export function findUnambiguousOperationEntryForMessage(input: {
  builtinLanguages: string[];
  message: string;
  root?: string;
  scope: ProjectScope;
}): OperationCatalogEntry | null {
  const entries = listOperationCatalogEntriesForScope({
    builtinLanguages: input.builtinLanguages,
    root: input.root,
    scope: input.scope,
  }).filter((entry) => input.message.includes(entry.name));

  return entries.length === 1 ? entries[0] : null;
}

export function findUnambiguousUserFacingOperationEntryForMessage(input: {
  builtinLanguages: string[];
  message: string;
  root?: string;
  scope: ProjectScope;
}): OperationCatalogEntry | null {
  const entries = listUserFacingOperationCatalogEntriesForScope({
    builtinLanguages: input.builtinLanguages,
    root: input.root,
    scope: input.scope,
  }).filter((entry) => input.message.includes(entry.name));

  return entries.length === 1 ? entries[0] : null;
}

export function resolveDefaultOperationRef(input: {
  builtinLanguages: string[];
  projectFilterId?: string;
  root?: string;
  scope: ProjectScope;
}): string | null {
  const entries = listOperationCatalogEntriesForScope({
    builtinLanguages: input.builtinLanguages,
    projectFilterId: input.projectFilterId,
    root: input.root,
    scope: input.scope,
  });

  return entries.find((entry) => entry.isDefault)?.ref ?? entries[0]?.ref ?? null;
}

export function resolveDefaultUserFacingOperationRef(input: {
  builtinLanguages: string[];
  projectFilterId?: string;
  root?: string;
  scope: ProjectScope;
}): string | null {
  const entries = listUserFacingOperationCatalogEntriesForScope({
    builtinLanguages: input.builtinLanguages,
    projectFilterId: input.projectFilterId,
    root: input.root,
    scope: input.scope,
  });

  return entries.find((entry) => entry.isDefault)?.ref ?? entries[0]?.ref ?? null;
}