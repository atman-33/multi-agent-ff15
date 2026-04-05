import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

function getConfigPaths(): [string, string] {
  const configDir = join(homedir(), ".config/opencode");

  return [
    join(configDir, "oh-my-openagent.json"),
    join(configDir, "oh-my-opencode.json"),
  ];
}

function resolveConfigPath(): string {
  const configPaths = getConfigPaths();

  return configPaths.find((configPath) => existsSync(configPath)) ?? configPaths[0];
}

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
  const configPaths = getConfigPaths();
  const configPath = resolveConfigPath();

  if (!existsSync(configPath)) {
    return {
      config: null,
      error: `Configuration file not found at ${configPaths.join(" or ")}`,
    };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as OhMyOpenCodeConfig;
    return { config };
  } catch (error) {
    return {
      config: null,
      error: `Failed to parse config at ${configPath}: ${String(error)}`,
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
  const configPath = resolveConfigPath();

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}