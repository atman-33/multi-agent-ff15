import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const requireFromWeb = createRequire(new URL("../web/package.json", import.meta.url));
const { parseDocument } = requireFromWeb("yaml");

type AppConfig = {
  executionWorkspaceRoot?: string;
  language: string;
  sharedSkillsRoot?: string;
  transportMode: "app-owned" | "tmux-resident";
};

const DEFAULT_APP_CONFIG: AppConfig = {
  language: "en",
  sharedSkillsRoot: "skills",
  transportMode: "app-owned",
};

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

type SupportedAction = "set-transport";

function parseRoot(argv: string[]): string {
  const rootIndex = argv.indexOf("--root");
  if (rootIndex === -1 || rootIndex === argv.length - 1) {
    throw new Error("Missing --root for app config control");
  }

  return argv[rootIndex + 1];
}

function getSettingsPath(root: string): string {
  return join(root, "config", "settings.yaml");
}

function ensureRequiredConfigFiles(root: string): void {
  const settingsPath = getSettingsPath(root);
  if (existsSync(settingsPath)) {
    return;
  }

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, DEFAULT_SETTINGS_YAML, { encoding: "utf-8", flag: "wx" });
}

function normalizeLanguage(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_APP_CONFIG.language;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : DEFAULT_APP_CONFIG.language;
}

function normalizeSharedSkillsRoot(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_APP_CONFIG.sharedSkillsRoot ?? "skills";
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : (DEFAULT_APP_CONFIG.sharedSkillsRoot ?? "skills");
}

function normalizeTransportMode(value: unknown): AppConfig["transportMode"] {
  return value === "tmux-resident" ? "tmux-resident" : DEFAULT_APP_CONFIG.transportMode;
}

function parseTransportMode(value: string | undefined): AppConfig["transportMode"] {
  if (value === "app-owned" || value === "tmux-resident") {
    return value;
  }

  throw new Error("Expected transport mode: app-owned or tmux-resident");
}

function readAppConfigDocument(root: string) {
  ensureRequiredConfigFiles(root);
  const raw = readFileSync(getSettingsPath(root), "utf-8");
  const document = parseDocument(raw);

  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error: Error) => error.message).join("\n"));
  }

  return document;
}

function readAppConfig(root: string): AppConfig {
  const document = readAppConfigDocument(root);
  const parsed = document.toJSON() as Record<string, unknown> | null;
  const executionWorkspaceRoot =
    typeof parsed?.execution_workspace_root === "string" &&
    parsed.execution_workspace_root.trim().length > 0
      ? parsed.execution_workspace_root.trim()
      : undefined;

  return {
    ...(executionWorkspaceRoot ? { executionWorkspaceRoot } : {}),
    language: normalizeLanguage(parsed?.language),
    sharedSkillsRoot: normalizeSharedSkillsRoot(parsed?.shared_skills_root),
    transportMode: normalizeTransportMode(parsed?.transport_mode),
  };
}

function writeAppConfig(root: string, nextConfig: AppConfig): AppConfig {
  const document = readAppConfigDocument(root);

  document.set("language", normalizeLanguage(nextConfig.language));
  document.set("shared_skills_root", normalizeSharedSkillsRoot(nextConfig.sharedSkillsRoot));
  document.set("transport_mode", normalizeTransportMode(nextConfig.transportMode));
  if (
    typeof nextConfig.executionWorkspaceRoot === "string" &&
    nextConfig.executionWorkspaceRoot.trim().length > 0
  ) {
    document.set("execution_workspace_root", nextConfig.executionWorkspaceRoot.trim());
  } else {
    document.delete("execution_workspace_root");
  }

  writeFileSync(getSettingsPath(root), String(document), "utf-8");
  return readAppConfig(root);
}

function parseArgs(argv: string[]): {
  action: SupportedAction;
  root: string;
  transportMode: AppConfig["transportMode"];
} {
  const [action, rawTransportMode] = argv;
  if (action !== "set-transport") {
    throw new Error("Expected action: set-transport");
  }

  return {
    action,
    root: parseRoot(argv),
    transportMode: parseTransportMode(rawTransportMode),
  };
}

function setTransportMode(root: string, transportMode: AppConfig["transportMode"]): void {
  const updatedConfig = writeAppConfig(root, {
    ...readAppConfig(root),
    transportMode,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        success: true,
        settingsPath: join(root, "config", "settings.yaml"),
        config: updatedConfig,
      },
      null,
      2,
    )}\n`,
  );
}

try {
  const { root, transportMode } = parseArgs(process.argv.slice(2));
  setTransportMode(root, transportMode);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}