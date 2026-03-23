import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG_PATH = join(homedir(), ".config/opencode/oh-my-opencode.json");

export interface ModelEntry {
  model: string;
  variant?: string;
}

export interface OhMyOpenCodeConfig {
  agents?: Record<string, ModelEntry>;
  categories?: Record<string, ModelEntry>;
}

export interface OhMyOpenCodeData {
  config: OhMyOpenCodeConfig | null;
  error?: string;
  isInstalled: boolean;
  models: string[];
  version: string;
}

function readVersion(): { isInstalled: boolean; version: string } {
  try {
    const version = execFileSync("oh-my-opencode", ["--version"], {
      encoding: "utf-8",
    }).trim();

    return { isInstalled: true, version };
  } catch {
    return { isInstalled: false, version: "unknown" };
  }
}

function readModels(): string[] {
  try {
    const stdout = execFileSync("opencode", ["models"], {
      encoding: "utf-8",
    });

    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) => line && !line.startsWith("opencode") && !line.includes("--") && line.includes("/")
      );
  } catch {
    return [];
  }
}

function readConfig(): { config: OhMyOpenCodeConfig | null; error?: string } {
  if (!existsSync(CONFIG_PATH)) {
    return {
      config: null,
      error: `Configuration file not found at ${CONFIG_PATH}`,
    };
  }

  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw) as OhMyOpenCodeConfig;
    return { config };
  } catch (error) {
    return {
      config: null,
      error: `Failed to parse config: ${String(error)}`,
    };
  }
}

export function readOhMyOpenCodeData(): OhMyOpenCodeData {
  const { isInstalled, version } = readVersion();
  const { config, error } = readConfig();
  const models = readModels();

  return {
    config,
    error,
    isInstalled,
    models,
    version,
  };
}

export function writeOhMyOpenCodeConfig(config: OhMyOpenCodeConfig) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}