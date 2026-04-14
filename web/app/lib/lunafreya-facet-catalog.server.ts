import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "yaml";
import {
  getProjectAuthoringDirectory,
  readRegisteredProjectDefinition,
} from "@/lib/project-config.server";
import { DEFAULT_LUNAFREYA_JOB_FILE_NAME } from "./lunafreya-prompt-context";
import { getProjectRoot } from "./get-project-root.server";

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const MARKDOWN_HEADING_REGEX = /^#\s+(.+)$/m;

export type LunafreyaFacetKind = "job" | "skill";

export interface LunafreyaFacetCatalogEntry {
  id: string;
  label: string;
  description: string | null;
  kind: LunafreyaFacetKind;
  sourceKind: "builtin" | "project";
  sourceLabel: string;
  filePath: string;
  language?: string;
  projectId?: string;
}

function getFacetDirectoryName(kind: LunafreyaFacetKind): "jobs" | "skills" {
  return kind === "job" ? "jobs" : "skills";
}

function getFacetEntries(
  kind: LunafreyaFacetKind,
  directory: string,
): Array<{ entryName: string; filePath: string }> {
  if (!existsSync(directory)) {
    return [];
  }

  if (kind === "job") {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => ({ entryName: entry.name, filePath: join(directory, entry.name) }))
      .sort((left, right) => left.entryName.localeCompare(right.entryName));
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      entryName: entry.name,
      filePath: join(directory, entry.name, "SKILL.md"),
    }))
    .filter((entry) => existsSync(entry.filePath))
    .sort((left, right) => left.entryName.localeCompare(right.entryName));
}

function parseFacetMetadata(content: string): {
  label: string | null;
  description: string | null;
} {
  const frontmatterMatch = content.match(FRONTMATTER_REGEX);
  const body = frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;

  if (frontmatterMatch) {
    try {
      const parsed = yaml.parse(frontmatterMatch[1]) as Record<string, unknown> | null;
      const name = typeof parsed?.name === "string" ? parsed.name.trim() : "";
      const description = typeof parsed?.description === "string" ? parsed.description.trim() : "";
      if (name) {
        return {
          label: name,
          description: description || null,
        };
      }

      if (description) {
        const heading = body.match(MARKDOWN_HEADING_REGEX)?.[1]?.trim() ?? null;
        return {
          label: heading,
          description,
        };
      }
    } catch {
      // Ignore invalid frontmatter and fall back to heading or file stem.
    }
  }

  const heading = body.match(MARKDOWN_HEADING_REGEX)?.[1]?.trim() ?? null;
  return {
    label: heading,
    description: null,
  };
}

function parseSkillMetadata(
  content: string,
  filePath: string,
): {
  label: string;
  description: string;
} {
  const frontmatterMatch = content.match(FRONTMATTER_REGEX);
  if (!frontmatterMatch) {
    throw new Error(`Skill entry must define frontmatter with name and description: ${filePath}`);
  }

  try {
    const parsed = yaml.parse(frontmatterMatch[1]) as Record<string, unknown> | null;
    const name = typeof parsed?.name === "string" ? parsed.name.trim() : "";
    const description = typeof parsed?.description === "string" ? parsed.description.trim() : "";

    if (name && description) {
      return {
        label: name,
        description,
      };
    }
  } catch {
    throw new Error(`Skill entry has invalid frontmatter: ${filePath}`);
  }

  throw new Error(`Skill entry must define non-empty name and description: ${filePath}`);
}

function buildBuiltinFacetId(language: string, directoryName: string, fileName: string): string {
  return `builtin:${language}:${directoryName}/${fileName}`;
}

function buildProjectFacetId(projectId: string, directoryName: string, fileName: string): string {
  return `project:${projectId}:${directoryName}/${fileName}`;
}

function toFacetEntry(input: {
  kind: LunafreyaFacetKind;
  sourceKind: "builtin" | "project";
  sourceLabel: string;
  filePath: string;
  entryName: string;
  id: string;
  language?: string;
  projectId?: string;
}): LunafreyaFacetCatalogEntry {
  const content = readFileSync(input.filePath, "utf-8");
  const metadata =
    input.kind === "skill"
      ? parseSkillMetadata(content, input.filePath)
      : parseFacetMetadata(content);

  return {
    id: input.id,
    label: metadata.label ?? input.entryName.replace(/\.md$/, ""),
    description: metadata.description,
    kind: input.kind,
    sourceKind: input.sourceKind,
    sourceLabel: input.sourceLabel,
    filePath: input.filePath,
    ...(input.language ? { language: input.language } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
  };
}

function listBuiltinFacetEntries(input: {
  root: string;
  kind: LunafreyaFacetKind;
  builtinLanguages: string[];
  includeReservedEntries?: boolean;
}): LunafreyaFacetCatalogEntry[] {
  const directoryName = getFacetDirectoryName(input.kind);
  const entries: LunafreyaFacetCatalogEntry[] = [];
  const seenEntryNames = new Set<string>();

  for (const language of [...new Set(input.builtinLanguages.filter(Boolean))]) {
    const directory = join(input.root, "builtins", language, "facets", directoryName);
    for (const entry of getFacetEntries(input.kind, directory)) {
      if (
        !input.includeReservedEntries &&
        input.kind === "job" &&
        entry.entryName === DEFAULT_LUNAFREYA_JOB_FILE_NAME
      ) {
        continue;
      }

      if (seenEntryNames.has(entry.entryName)) {
        continue;
      }

      seenEntryNames.add(entry.entryName);
      entries.push(
        toFacetEntry({
          kind: input.kind,
          sourceKind: "builtin",
          sourceLabel: "Builtin",
          filePath: entry.filePath,
          entryName: entry.entryName,
          id: buildBuiltinFacetId(language, directoryName, entry.entryName),
          language,
        }),
      );
    }
  }

  return entries;
}

function listProjectFacetEntries(input: {
  root: string;
  kind: LunafreyaFacetKind;
  executionProjectId?: string;
}): LunafreyaFacetCatalogEntry[] {
  if (!input.executionProjectId) {
    return [];
  }

  const project = readRegisteredProjectDefinition(input.root, input.executionProjectId);
  if (!project) {
    return [];
  }

  const directoryName = getFacetDirectoryName(input.kind);
  const directory = join(
    getProjectAuthoringDirectory(input.root, input.executionProjectId),
    "facets",
    directoryName,
  );

  return getFacetEntries(input.kind, directory).map((entry) =>
    toFacetEntry({
      kind: input.kind,
      sourceKind: "project",
      sourceLabel: project.name,
      filePath: entry.filePath,
      entryName: entry.entryName,
      id: buildProjectFacetId(project.id, directoryName, entry.entryName),
      projectId: project.id,
    }),
  );
}

export function listLunafreyaFacetCatalogEntries(input: {
  kind: LunafreyaFacetKind;
  builtinLanguages: string[];
  executionProjectId?: string;
  root?: string;
  includeReservedEntries?: boolean;
}): LunafreyaFacetCatalogEntry[] {
  const root = input.root ?? getProjectRoot();

  return [
    ...listBuiltinFacetEntries({
      root,
      kind: input.kind,
      builtinLanguages: input.builtinLanguages,
      includeReservedEntries: input.includeReservedEntries,
    }),
    ...listProjectFacetEntries({
      root,
      kind: input.kind,
      executionProjectId: input.executionProjectId,
    }),
  ];
}