import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import yaml from "yaml";
import {
  getProjectAuthoringDirectory,
  readRegisteredProjectDefinition,
} from "@/lib/project-config.server";
import { getProjectRoot } from "./get-project-root.server";

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const MARKDOWN_HEADING_REGEX = /^#\s+(.+)$/m;

export type LunafreyaFacetKind = "job" | "knowledge";

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

function getFacetDirectoryName(kind: LunafreyaFacetKind): "jobs" | "knowledge" {
  return kind === "job" ? "jobs" : "knowledge";
}

function getFacetFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
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
  id: string;
  language?: string;
  projectId?: string;
}): LunafreyaFacetCatalogEntry {
  const content = readFileSync(input.filePath, "utf-8");
  const metadata = parseFacetMetadata(content);

  return {
    id: input.id,
    label: metadata.label ?? basename(input.filePath).replace(/\.md$/, ""),
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
}): LunafreyaFacetCatalogEntry[] {
  const directoryName = getFacetDirectoryName(input.kind);
  const entries: LunafreyaFacetCatalogEntry[] = [];
  const seenFileNames = new Set<string>();

  for (const language of [...new Set(input.builtinLanguages.filter(Boolean))]) {
    const directory = join(input.root, "builtins", language, "facets", directoryName);
    for (const fileName of getFacetFiles(directory)) {
      if (seenFileNames.has(fileName)) {
        continue;
      }

      seenFileNames.add(fileName);
      entries.push(
        toFacetEntry({
          kind: input.kind,
          sourceKind: "builtin",
          sourceLabel: "Builtin",
          filePath: join(directory, fileName),
          id: buildBuiltinFacetId(language, directoryName, fileName),
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

  return getFacetFiles(directory).map((fileName) =>
    toFacetEntry({
      kind: input.kind,
      sourceKind: "project",
      sourceLabel: project.name,
      filePath: join(directory, fileName),
      id: buildProjectFacetId(project.id, directoryName, fileName),
      projectId: project.id,
    }),
  );
}

export function listLunafreyaFacetCatalogEntries(input: {
  kind: LunafreyaFacetKind;
  builtinLanguages: string[];
  executionProjectId?: string;
  root?: string;
}): LunafreyaFacetCatalogEntry[] {
  const root = input.root ?? getProjectRoot();

  return [
    ...listBuiltinFacetEntries({
      root,
      kind: input.kind,
      builtinLanguages: input.builtinLanguages,
    }),
    ...listProjectFacetEntries({
      root,
      kind: input.kind,
      executionProjectId: input.executionProjectId,
    }),
  ];
}