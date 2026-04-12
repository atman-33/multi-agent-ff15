import { readFileSync } from "node:fs";
import type { LunafreyaFacetSelection } from "@/lib/types/mission";
import {
  type LunafreyaFacetCatalogEntry,
  listLunafreyaFacetCatalogEntries,
} from "./lunafreya-facet-catalog.server";
import {
  buildMarkdownSection,
  buildTextSection,
  joinXmlSections,
} from "./prompt-composition-engine/prompt-xml";

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

function buildFacetSection(tagName: string, entry: LunafreyaFacetCatalogEntry): string {
  return buildMarkdownSection(tagName, stripFrontmatter(readFileSync(entry.filePath, "utf-8")), {
    id: entry.id,
    label: entry.label,
    source: entry.sourceLabel,
  });
}

export interface ResolvedLunafreyaFacetSelection {
  selection: LunafreyaFacetSelection;
  selectedJobLabel: string | null;
  selectedKnowledgeLabels: string[];
  promptExtension: string | null;
}

export function resolveLunafreyaFacetSelection(input: {
  builtinLanguages: string[];
  executionProjectId?: string;
  selectedJobId?: string;
  selectedKnowledgeIds?: readonly string[];
  root?: string;
}): ResolvedLunafreyaFacetSelection {
  const jobEntries = listLunafreyaFacetCatalogEntries({
    kind: "job",
    builtinLanguages: input.builtinLanguages,
    executionProjectId: input.executionProjectId,
    root: input.root,
  });
  const knowledgeEntries = listLunafreyaFacetCatalogEntries({
    kind: "knowledge",
    builtinLanguages: input.builtinLanguages,
    executionProjectId: input.executionProjectId,
    root: input.root,
  });

  const selectedJobId = input.selectedJobId?.trim() || undefined;
  const normalizedKnowledgeIds = dedupeIds(input.selectedKnowledgeIds ?? []);
  const selectedJobEntry = selectedJobId
    ? findFacetEntryOrThrow(jobEntries, selectedJobId, "job")
    : null;
  const selectedKnowledgeEntries = normalizedKnowledgeIds.map((id) =>
    findFacetEntryOrThrow(knowledgeEntries, id, "knowledge"),
  );

  const selection: LunafreyaFacetSelection = {
    ...(selectedJobEntry ? { selectedJobId: selectedJobEntry.id } : {}),
    selectedKnowledgeIds: selectedKnowledgeEntries.map((entry) => entry.id),
    updatedAt: new Date().toISOString(),
  };

  const promptSections = [
    selectedJobEntry || selectedKnowledgeEntries.length > 0
      ? buildTextSection(
          "lunafreya-overlays",
          "Apply the selected job and knowledge overlays below on top of the base Lunafreya agent profile. These selections take effect starting with this User turn.",
        )
      : null,
    selectedJobEntry ? buildFacetSection("lunafreya-job-overlay", selectedJobEntry) : null,
    ...selectedKnowledgeEntries.map((entry) => buildFacetSection("lunafreya-knowledge-overlay", entry)),
  ];

  return {
    selection,
    selectedJobLabel: selectedJobEntry?.label ?? null,
    selectedKnowledgeLabels: selectedKnowledgeEntries.map((entry) => entry.label),
    promptExtension: joinXmlSections(promptSections) || null,
  };
}