import { readFileSync } from "node:fs";
import { buildSkillsCatalog, normalizeFileSkillEntry } from "@/lib/skill-catalog.server";
import type { LunafreyaFacetSelection } from "@/lib/types/mission";
import {
  DEFAULT_LUNAFREYA_JOB_FILE_NAME,
  DEFAULT_LUNAFREYA_JOB_LABEL,
} from "./lunafreya-prompt-context";
import {
  type LunafreyaFacetCatalogEntry,
  listLunafreyaFacetCatalogEntries,
} from "./lunafreya-facet-catalog.server";
import { buildMarkdownSection, joinXmlSections } from "./prompt-composition-engine/prompt-xml";

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function stripFrontmatter(content: string): string {
  const frontmatterMatch = content.match(FRONTMATTER_REGEX);
  return frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;
}

function dedupeIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const id of ids) {
    const value = id.trim();
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function findFacetEntryOrThrow(
  entries: LunafreyaFacetCatalogEntry[],
  id: string,
  kindLabel: string,
): LunafreyaFacetCatalogEntry {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`Selected Lunafreya ${kindLabel} is not available: ${id}`);
  }

  return entry;
}

function findDefaultJobEntryOrThrow(
  entries: LunafreyaFacetCatalogEntry[],
): LunafreyaFacetCatalogEntry {
  const entry = entries.find(
    (candidate) =>
      candidate.kind === "job" && candidate.filePath.endsWith(`/${DEFAULT_LUNAFREYA_JOB_FILE_NAME}`),
  );

  if (!entry) {
    throw new Error("Default Lunafreya job is not available.");
  }

  return entry;
}

export interface ResolvedLunafreyaPromptContext {
  selection: LunafreyaFacetSelection;
  selectedJobLabel: string;
  effectiveJobLabel: string;
  selectedSkillLabels: string[];
  promptExtension: string;
}

export function resolveLunafreyaPromptContext(input: {
  builtinLanguages: string[];
  executionProjectId?: string;
  selectedJobId?: string;
  selectedSkillIds?: readonly string[];
  root?: string;
}): ResolvedLunafreyaPromptContext {
  const jobEntries = listLunafreyaFacetCatalogEntries({
    kind: "job",
    builtinLanguages: input.builtinLanguages,
    executionProjectId: input.executionProjectId,
    root: input.root,
    includeReservedEntries: true,
  });
  const skillEntries = listLunafreyaFacetCatalogEntries({
    kind: "skill",
    builtinLanguages: input.builtinLanguages,
    executionProjectId: input.executionProjectId,
    root: input.root,
  });

  const defaultJobEntry = findDefaultJobEntryOrThrow(jobEntries);
  const normalizedSelectedJobId = input.selectedJobId?.trim() || undefined;
  const selectedJobEntry = normalizedSelectedJobId
    ? findFacetEntryOrThrow(jobEntries, normalizedSelectedJobId, "job")
    : null;
  const effectiveJobEntry =
    selectedJobEntry && selectedJobEntry.id !== defaultJobEntry.id ? selectedJobEntry : defaultJobEntry;
  const normalizedSkillIds = dedupeIds(input.selectedSkillIds ?? []);
  const selectedSkillEntries = normalizedSkillIds.map((id) =>
    findFacetEntryOrThrow(skillEntries, id, "skill"),
  );

  const selection: LunafreyaFacetSelection = {
    ...(effectiveJobEntry.id !== defaultJobEntry.id ? { selectedJobId: effectiveJobEntry.id } : {}),
    selectedSkillIds: selectedSkillEntries.map((entry) => entry.id),
    updatedAt: new Date().toISOString(),
  };

  const promptSections = [
    buildMarkdownSection(
      "job",
      stripFrontmatter(readFileSync(effectiveJobEntry.filePath, "utf-8")),
    ),
    buildSkillsCatalog(
      selectedSkillEntries.map((entry) =>
        normalizeFileSkillEntry(readFileSync(entry.filePath, "utf-8"), entry.filePath),
      ),
    ),
  ];

  const effectiveJobLabel =
    effectiveJobEntry.id === defaultJobEntry.id ? DEFAULT_LUNAFREYA_JOB_LABEL : effectiveJobEntry.label;

  return {
    selection,
    selectedJobLabel: effectiveJobLabel,
    effectiveJobLabel,
    selectedSkillLabels: selectedSkillEntries.map((entry) => entry.label),
    promptExtension: joinXmlSections(promptSections),
  };
}