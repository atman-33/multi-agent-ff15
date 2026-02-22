import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/getProjectRoot.server";

interface SlashSuggestion {
  label: string;
  value: string;
  source: "command" | "skill";
}

function collectDirectoryEntries(root: string, relativeDir: string): string[] {
  const targetDir = join(root, relativeDir);
  if (!existsSync(targetDir)) {
    return [];
  }

  return readdirSync(targetDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("."))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * GET /api/slash-suggestions
 * Returns candidates from .opencode/command(.s) and .opencode/opencode skills folders.
 */
export async function loader() {
  try {
    const root = getProjectRoot();

    const commandEntries = [".opencode/command", ".opencode/commands", "opencode/command", "opencode/commands"]
      .flatMap((path) => collectDirectoryEntries(root, path));

    const skillEntries = [".opencode/skills", "opencode/skills"]
      .flatMap((path) => collectDirectoryEntries(root, path));

    const commandSuggestions: SlashSuggestion[] = Array.from(new Set(commandEntries)).map((entry) => {
      const name = entry.replace(/\.md$/, "");
      return {
        label: `command: ${name}`,
        value: `/${name}`,
        source: "command",
      };
    });

    const skillSuggestions: SlashSuggestion[] = Array.from(new Set(skillEntries)).map((entry) => ({
      label: `skill: ${entry}`,
      value: `/${entry}`,
      source: "skill",
    }));

    return Response.json({
      suggestions: [...commandSuggestions, ...skillSuggestions],
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

