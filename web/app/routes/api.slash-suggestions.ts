import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import type { Route } from "./+types/api.slash-suggestions";

type SlashSuggestion = {
  description?: string;
  insertText: string;
  label: string;
  type: "command" | "skill";
  value: string;
};

function getSearchRoot(): string {
  const cwd = process.cwd();
  return basename(cwd) === "web" ? join(cwd, "..") : cwd;
}

function collectCommandSuggestions(root: string): SlashSuggestion[] {
  const commandDirs = [
    ".opencode/command",
    ".opencode/commands",
    "opencode/command",
    "opencode/commands",
  ];
  const seen = new Set<string>();
  const suggestions: SlashSuggestion[] = [];

  for (const relDir of commandDirs) {
    const targetDir = join(root, relDir);
    if (!existsSync(targetDir)) {
      continue;
    }

    const entries = readdirSync(targetDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith("."))
      .sort((left, right) => left.localeCompare(right));

    for (const name of entries) {
      const baseName = name.replace(/\.md$/i, "");
      if (seen.has(baseName)) {
        continue;
      }

      seen.add(baseName);
      suggestions.push({
        label: `/${baseName}`,
        value: baseName,
        type: "command",
        description: relDir,
        insertText: `Follow instructions in ${relDir}/${name}. `,
      });
    }
  }

  return suggestions;
}

function collectSkillSuggestions(root: string): SlashSuggestion[] {
  const skillDirs = [
    ".github/skills",
    ".opencode/skills",
    ".claude/skills",
    "opencode/skills",
  ];
  const seen = new Set<string>();
  const suggestions: SlashSuggestion[] = [];

  for (const relDir of skillDirs) {
    const targetDir = join(root, relDir);
    if (!existsSync(targetDir)) {
      continue;
    }

    const entries = readdirSync(targetDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith("."))
      .sort((left, right) => left.localeCompare(right));

    for (const name of entries) {
      if (seen.has(name)) {
        continue;
      }

      seen.add(name);
      suggestions.push({
        label: `/${name}`,
        value: name,
        type: "skill",
        description: relDir,
        insertText: `Follow instructions in ${relDir}/${name}/SKILL.md. `,
      });
    }
  }

  return suggestions;
}

export const loader = async (_args: Route.LoaderArgs) => {
  try {
    const root = getSearchRoot();
    return Response.json({
      suggestions: [...collectCommandSuggestions(root), ...collectSkillSuggestions(root)],
    });
  } catch {
    return Response.json({ suggestions: [] }, { status: 503 });
  }
};