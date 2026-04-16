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
import { parseOperationStudioAuthoringTarget } from "./authoring-target";
import type {
  OperationStudioAuthoringTarget,
  OperationStudioCatalogOptions,
} from "./types";

function listBuiltinLanguages(language: string): string[] {
  return language === "en" ? ["en"] : [language, "en"];
}

export { parseOperationStudioAuthoringTarget } from "./authoring-target";

function resolveProjectFilterId(target: OperationStudioAuthoringTarget): string | undefined {
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

export function listOperationStudioOperationOptions(
  options: OperationStudioCatalogOptions,
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

export interface OperationStudioLunafreyaFacetCatalog {
  jobOptions: LunafreyaFacetCatalogEntry[];
  skillOptions: LunafreyaFacetCatalogEntry[];
  promptExtension: string | null;
  selectedJobLabel: string | null;
  selectedJobId: string | null;
  selectedSkillIds: string[];
  selectedSkillLabels: string[];
  selection: ResolvedLunafreyaFacetSelection["selection"];
}

export function resolveOperationStudioLunafreyaFacetCatalog(input: {
  root?: string;
  selectedJobId?: string;
  selectedSkillIds?: readonly string[];
  target: OperationStudioAuthoringTarget;
}): OperationStudioLunafreyaFacetCatalog {
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

export function resolveOperationStudioProjectContext(
  target: OperationStudioAuthoringTarget,
): { projectId: string | null; scope: ProjectScope } {
  return {
    projectId: target.kind === "project" ? target.projectId : null,
    scope: target.kind === "project" ? "noctis_team" : "noctis_team",
  };
}