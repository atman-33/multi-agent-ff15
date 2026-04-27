import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DEFAULT_SETTINGS_YAML = [
  "# multi-agent-ff15 configuration file",
  "",
  "# Language setting",
  "# ja: Japanese only (FF15-style Japanese, no bilingual output)",
  "# en: English (FF15-style Japanese + English translation in parentheses)",
  "# Other language codes (es, zh, ko, fr, de, etc.) also supported",
  "language: en",
  "",
  "# OpenCode transport mode",
  '# app-owned: use the existing app-managed OpenCode server transport',
  '# tmux-resident: use the persistent per-agent tmux/OpenCode transport runtime',
  'transport_mode: "app-owned"',
  "",
  "# Shared skills root",
  "# Relative path from the repository root used to discover globally selectable shared skills",
  'shared_skills_root: "skills"',
  "",
].join("\n");

function ensureFile(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    return;
  }

  mkdirSync(dirname(filePath), { recursive: true });

  try {
    writeFileSync(filePath, content, { encoding: "utf-8", flag: "wx" });
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
      throw error;
    }
  }
}

export function ensureRequiredWebConfigFiles(root: string): void {
  ensureFile(join(root, "config", "settings.yaml"), DEFAULT_SETTINGS_YAML);
}
