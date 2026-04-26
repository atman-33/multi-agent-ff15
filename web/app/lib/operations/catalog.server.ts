import {
  listLunafreyaFacetCatalogEntries,
  type LunafreyaFacetCatalogEntry,
} from "@/lib/lunafreya-facet-catalog.server";
import {
  resolveLunafreyaFacetSelection,
  type ResolvedLunafreyaFacetSelection,
} from "@/lib/lunafreya-facet-selection.server";
import { listOperationCatalogEntriesForScope } from "@/lib/operation-definition/operation-catalog";
import { readOperationLanguage } from "@/lib/operation-definition/language";
import {
  compareOperationOptions,
  toOperationOption,
  type OperationOption,
} from "@/lib/operation-presentation";
import type { ProjectScope } from "@/lib/project-scopes";
import type {
  OperationsAuthoringTarget,
  OperationsCatalogOptions,
} from "./types";

function listBuiltinLanguages(language: string): string[] {
  return language === "en" ? ["en"] : [language, "en"];
}

export { parseOperationsAuthoringTarget } from "./authoring-target";

function resolveProjectFilterId(target: OperationsAuthoringTarget): string | undefined {
  return target.kind === "project" ? target.projectId : undefined;
}

function normalizeSelectedJobId(
  jobOptions: LunafreyaFacetCatalogEntry[],
  selectedJobId?: string,
): string | undefined {
  const normalized = selectedJobId?.trim();
  if (!normalized) {
    return undefined;
  }

  return jobOptions.some((option) => option.id === normalized) ? normalized : undefined;
}

function normalizeSelectedSkillIds(
  skillOptions: LunafreyaFacetCatalogEntry[],
  selectedSkillIds: readonly string[] = [],
): string[] {
  const allowedIds = new Set(skillOptions.map((option) => option.id));
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const skillId of selectedSkillIds) {
    const value = skillId.trim();
    if (!value || seen.has(value) || !allowedIds.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function listOperationsOperationOptions(
  options: OperationsCatalogOptions,
): OperationOption[] {
  const language = readOperationLanguage();
  const builtinLanguages = listBuiltinLanguages(language);

  return listOperationCatalogEntriesForScope({
    builtinLanguages,
    projectFilterId: resolveProjectFilterId(options.target),
    scope: options.scope,
  })
    .filter((entry) =>
      options.target.kind === "builtin" ? entry.sourceKind === "builtin" : true,
    )
    .map(toOperationOption)
    .sort(compareOperationOptions);
}

export interface OperationsLunafreyaFacetCatalog {
  jobOptions: LunafreyaFacetCatalogEntry[];
  skillOptions: LunafreyaFacetCatalogEntry[];
  promptExtension: string | null;
  selectedJobLabel: string | null;
  selectedJobId: string | null;
  selectedSkillIds: string[];
  selectedSkillLabels: string[];
  selection: ResolvedLunafreyaFacetSelection["selection"];
}

export function resolveOperationsLunafreyaFacetCatalog(input: {
  root?: string;
  selectedJobId?: string;
  selectedSkillIds?: readonly string[];
  target: OperationsAuthoringTarget;
}): OperationsLunafreyaFacetCatalog {
  const language = readOperationLanguage();
  const builtinLanguages = listBuiltinLanguages(language);
  const executionProjectId = resolveProjectFilterId(input.target);
  const jobOptions = listLunafreyaFacetCatalogEntries({
    kind: "job",
    builtinLanguages,
    executionProjectId,
    root: input.root,
  });
  const skillOptions = listLunafreyaFacetCatalogEntries({
    kind: "skill",
    builtinLanguages,
    executionProjectId,
    root: input.root,
  });
  const normalizedSelectedJobId = normalizeSelectedJobId(jobOptions, input.selectedJobId);
  const normalizedSelectedSkillIds = normalizeSelectedSkillIds(
    skillOptions,
    input.selectedSkillIds,
  );
  const resolved = resolveLunafreyaFacetSelection({
    builtinLanguages,
    executionProjectId,
    root: input.root,
    selectedJobId: normalizedSelectedJobId,
    selectedSkillIds: normalizedSelectedSkillIds,
  });

  return {
    jobOptions,
    skillOptions,
    promptExtension: resolved.promptExtension,
    selectedJobLabel: resolved.selectedJobLabel,
    selectedJobId: resolved.selection.selectedJobId ?? null,
    selectedSkillIds: resolved.selection.selectedSkillIds,
    selectedSkillLabels: resolved.selectedSkillLabels,
    selection: resolved.selection,
  };
}

export function resolveOperationsProjectContext(
  target: OperationsAuthoringTarget,
): { projectId: string | null; scope: ProjectScope } {
  return {
    projectId: target.kind === "project" ? target.projectId : null,
    scope: target.kind === "project" ? "noctis_team" : "noctis_team",
  };
}