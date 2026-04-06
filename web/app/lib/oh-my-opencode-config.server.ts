import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { OhMyOpenCodeConfig, OhMyOpenCodeData } from "@/lib/oh-my-opencode-config";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { getOpencodeClient } from "@/lib/opencode-client";
import {
  readOpencodeModelCatalog,
  refreshOpencodeModelCatalog,
} from "@/lib/opencode-model-catalog.server";

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

async function readProviders(): Promise<OhMyOpenCodeData["providers"]> {
  try {
    const client = getOpencodeClient();
    const result = await client.config.providers();

    if (result.error || !result.data || !Array.isArray(result.data.providers)) {
      return [];
    }

    return result.data.providers;
  } catch {
    return [];
  }
}

export async function readOhMyOpenCodeData(options?: {
  refreshCatalog?: boolean;
}): Promise<OhMyOpenCodeData> {
  const { isInstalled, version } = readVersion();
  const { config, error } = readConfig();
  const root = getProjectRoot();

  if (options?.refreshCatalog) {
    try {
      await refreshOpencodeModelCatalog(root);
    } catch {
      // fall through to the last successful snapshot if available
    }
  }

  const [catalog, providers] = await Promise.all([
    readOpencodeModelCatalog({
      root,
      waitForLatest: !options?.refreshCatalog,
    }),
    readProviders(),
  ]);

  return {
    catalog: {
      generatedAt: catalog.snapshot?.generatedAt ?? null,
      lastError: catalog.lastError ?? undefined,
      refreshState: catalog.refreshState,
      stale: catalog.stale,
    },
    config,
    error,
    isInstalled,
    models: catalog.snapshot?.models ?? [],
    providers,
    variantsByModel: catalog.snapshot?.variantsByModel ?? {},
    version,
  };
}

export function writeOhMyOpenCodeConfig(config: OhMyOpenCodeConfig) {
  const configPath = resolveConfigPath();

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}