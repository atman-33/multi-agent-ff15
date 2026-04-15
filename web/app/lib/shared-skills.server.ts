import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { parseDocument } from "yaml";
import type { ResolvedSkillEntry } from "@/lib/operation-definition/types";
import { readAppConfig } from "./app-config.server";
import { normalizeFileSkillEntry } from "./skill-catalog.server";

export interface SharedSkillsSelection {
  selectedSkillIds: string[];
}

export interface SharedSkillCatalogEntry {
  description: string;
  filePath: string;
  id: string;
  name: string;
}

export interface InvalidSharedSkillSelection {
  id: string;
  reason: "invalid" | "missing";
}

export interface ResolvedSharedSkills {
  invalidSelections: InvalidSharedSkillSelection[];
  selectedSkillIds: string[];
  validEntries: ResolvedSkillEntry[];
}

export interface SharedSkillsState {
  invalidSelections: InvalidSharedSkillSelection[];
  selection: SharedSkillsSelection;
  selectionPath: string;
  settingsPath: string;
  sharedSkillsRoot: string;
  skills: SharedSkillCatalogEntry[];
}

export const SHARED_SKILLS_SELECTION_PATH = "config/shared-skills.yaml";
export const SHARED_SKILLS_SETTINGS_PATH = "config/settings.yaml";

const DEFAULT_SHARED_SKILLS_CONFIG = ["selected_skill_ids: []", ""].join("\n");

function getSharedSkillsConfigPath(root: string): string {
  return join(root, "config", "shared-skills.yaml");
}

function getSharedSkillsRoot(root: string): string {
  return resolve(root, readAppConfig(root).sharedSkillsRoot ?? "skills");
}

function dedupeSkillIds(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function readSharedSkillsDocument(root: string) {
  const configPath = getSharedSkillsConfigPath(root);
  if (!existsSync(configPath)) {
    return parseDocument(DEFAULT_SHARED_SKILLS_CONFIG);
  }

  const document = parseDocument(readFileSync(configPath, "utf-8"));
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("\n"));
  }

  return document;
}

function resolveSkillFilePath(root: string, id: string): string | null {
  const sharedSkillsRoot = getSharedSkillsRoot(root);
  const absolutePath = resolve(sharedSkillsRoot, id, "SKILL.md");
  const normalizedRoot = sharedSkillsRoot.endsWith(sep) ? sharedSkillsRoot : `${sharedSkillsRoot}${sep}`;

  if (absolutePath !== sharedSkillsRoot && !absolutePath.startsWith(normalizedRoot)) {
    return null;
  }

  return absolutePath;
}

function collectSkillEntries(directory: string, rootDirectory: string): SharedSkillCatalogEntry[] {
  if (!existsSync(directory)) {
    return [];
  }

  const entries: SharedSkillCatalogEntry[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryDirectory = join(directory, entry.name);
    const skillFile = join(entryDirectory, "SKILL.md");

    if (existsSync(skillFile)) {
      try {
        const normalized = normalizeFileSkillEntry(readFileSync(skillFile, "utf-8"), skillFile);
        entries.push({
          description: normalized.description,
          filePath: normalized.file,
          id: entryDirectory.slice(rootDirectory.length + 1).replace(/\\/g, "/"),
          name: normalized.name,
        });
      } catch {
        // Ignore invalid catalog entries; selected broken skills are surfaced separately.
      }
    }

    entries.push(...collectSkillEntries(entryDirectory, rootDirectory));
  }

  return entries;
}

export function readSharedSkillsSelection(root: string): SharedSkillsSelection {
  const document = readSharedSkillsDocument(root);
  const parsed = document.toJSON() as Record<string, unknown> | null;

  return {
    selectedSkillIds: dedupeSkillIds(
      Array.isArray(parsed?.selected_skill_ids) ? parsed.selected_skill_ids : [],
    ),
  };
}

export function writeSharedSkillsSelection(
  root: string,
  nextSelection: SharedSkillsSelection,
): SharedSkillsSelection {
  const configPath = getSharedSkillsConfigPath(root);
  const selection = {
    selectedSkillIds: dedupeSkillIds(nextSelection.selectedSkillIds),
  };
  const document = readSharedSkillsDocument(root);

  document.set("selected_skill_ids", selection.selectedSkillIds);
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(configPath, String(document), "utf-8");

  return selection;
}

export function listSharedSkillCatalogEntries(root: string): SharedSkillCatalogEntry[] {
  const sharedSkillsRoot = getSharedSkillsRoot(root);

  return collectSkillEntries(sharedSkillsRoot, sharedSkillsRoot).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

export function readSharedSkillsState(root: string): SharedSkillsState {
  const config = readAppConfig(root);
  const selection = readSharedSkillsSelection(root);
  const resolvedSelection = resolveSelectedSharedSkills(root, selection.selectedSkillIds);

  return {
    invalidSelections: resolvedSelection.invalidSelections,
    selection,
    selectionPath: SHARED_SKILLS_SELECTION_PATH,
    settingsPath: SHARED_SKILLS_SETTINGS_PATH,
    sharedSkillsRoot: config.sharedSkillsRoot ?? "skills",
    skills: listSharedSkillCatalogEntries(root),
  };
}

export function resolveSelectedSharedSkills(
  root: string,
  selectedSkillIds: readonly string[] = readSharedSkillsSelection(root).selectedSkillIds,
): ResolvedSharedSkills {
  const normalizedIds = dedupeSkillIds(selectedSkillIds);
  const validEntries: ResolvedSkillEntry[] = [];
  const invalidSelections: InvalidSharedSkillSelection[] = [];

  for (const id of normalizedIds) {
    const filePath = resolveSkillFilePath(root, id);
    if (!filePath || !existsSync(filePath)) {
      invalidSelections.push({ id, reason: "missing" });
      continue;
    }

    try {
      validEntries.push(normalizeFileSkillEntry(readFileSync(filePath, "utf-8"), filePath));
    } catch {
      invalidSelections.push({ id, reason: "invalid" });
    }
  }

  return {
    invalidSelections,
    selectedSkillIds: normalizedIds,
    validEntries,
  };
}