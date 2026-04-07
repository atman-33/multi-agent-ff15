import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readAppConfig } from "@/lib/app-config.server";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { listOperationCatalogEntriesForScope } from "@/lib/operation-definition/operation-catalog";
import { getActiveProjectDefinitionsForScope } from "@/lib/project-config.server";
import {
  compareOperationOptions,
  toOperationOption,
  type OperationOption,
} from "@/lib/operation-presentation";

export interface OperationDebugProjectFilterOption {
  label: string;
  value: string;
}

function getOperationsDirectory(root: string, language: string): string {
  return join(root, "builtins", language, "operations");
}

function readConfiguredLanguage(root: string): string {
  try {
    return readAppConfig(root).language || "en";
  } catch {
    return "en";
  }
}

function listOperationNamesForLanguage(root: string, language: string): string[] {
  const directory = getOperationsDirectory(root, language);
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory)
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .map((file) => file.replace(/\.ya?ml$/, ""))
    .sort((left, right) => left.localeCompare(right));
}

function listAvailableOperationLanguages(root: string): string[] {
  const builtinsDirectory = join(root, "builtins");
  if (!existsSync(builtinsDirectory)) {
    return [];
  }

  return readdirSync(builtinsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((language) => listOperationNamesForLanguage(root, language).length > 0)
    .sort((left, right) => left.localeCompare(right));
}

function listPreferredFallbackLanguages(configuredLanguage: string): string[] {
  if (configuredLanguage === "ja") {
    return ["ja", "en"];
  }

  if (configuredLanguage === "en") {
    return ["en", "ja"];
  }

  return [configuredLanguage, "ja", "en"];
}

function resolveOperationDebugLanguageFromRoot(root: string): string {
  const configuredLanguage = readConfiguredLanguage(root);
  const availableLanguages = listAvailableOperationLanguages(root);
  const preferredLanguages = [...new Set(listPreferredFallbackLanguages(configuredLanguage))];

  for (const language of preferredLanguages) {
    if (availableLanguages.includes(language)) {
      return language;
    }
  }

  return availableLanguages[0] ?? configuredLanguage;
}

export function resolveOperationDebugLanguage(): string {
  return resolveOperationDebugLanguageFromRoot(getProjectRoot());
}

export function listOperationDebugProjectFilterOptions(): OperationDebugProjectFilterOption[] {
  const root = getProjectRoot();

  return [
    { value: "all", label: "All Active Projects" },
    ...getActiveProjectDefinitionsForScope(root, "noctis_team").map((project) => ({
      value: project.id,
      label: project.name,
    })),
  ];
}

export function listOperationDebugOptions(projectFilterId?: string): OperationOption[] {
  const root = getProjectRoot();
  const language = resolveOperationDebugLanguageFromRoot(root);

  return listOperationCatalogEntriesForScope({
    root,
    scope: "noctis_team",
    builtinLanguages: [language],
    projectFilterId,
  })
    .map(toOperationOption)
    .sort(compareOperationOptions);
}