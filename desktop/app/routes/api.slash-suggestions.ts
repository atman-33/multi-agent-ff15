import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";

interface SlashSuggestion {
  insertText: string;
  label: string;
  source: "command" | "skill";
  value: string;
}

function collectDirectoryEntriesWithPath(
  root: string,
  relDirs: string[]
): Array<{ name: string; relDir: string }> {
  const seen = new Set<string>();
  const result: Array<{ name: string; relDir: string }> = [];

  for (const relDir of relDirs) {
    const targetDir = join(root, relDir);
    if (!existsSync(targetDir)) {
      continue;
    }

    const entries = readdirSync(targetDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith("."))
      .sort((a, b) => a.localeCompare(b));

    for (const name of entries) {
      if (!seen.has(name)) {
        seen.add(name);
        result.push({ name, relDir });
      }
    }
  }

  return result;
}

const MD_EXT_REGEX = /\.md$/;

export function loader() {
  try {
    const root = getProjectRoot();

    const commandEntries = collectDirectoryEntriesWithPath(root, [
      ".opencode/command",
      ".opencode/commands",
      "opencode/command",
      "opencode/commands",
    ]);

    const skillEntries = collectDirectoryEntriesWithPath(root, [
      ".opencode/skills",
      "opencode/skills",
    ]);

    const commandSuggestions: SlashSuggestion[] = commandEntries.map(
      ({ name, relDir }) => {
        const baseName = name.replace(MD_EXT_REGEX, "");
        return {
          label: `command: ${baseName}`,
          value: `/${baseName} `,
          insertText: `Follow instructions in ${relDir}/${name}. `,
          source: "command",
        };
      }
    );

    const skillSuggestions: SlashSuggestion[] = skillEntries.map(
      ({ name, relDir }) => ({
        label: `skill: ${name}`,
        value: `/${name} `,
        insertText: `Follow instructions in ${relDir}/${name}/SKILL.md. `,
        source: "skill",
      })
    );

    return Response.json({
      suggestions: [...commandSuggestions, ...skillSuggestions],
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
