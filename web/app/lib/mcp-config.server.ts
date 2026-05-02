import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAppConfig } from "@/lib/app-config.server";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { TMUX_TRANSPORT_CONFIG_STATE_FILE } from "@/lib/tmux-transport-bootstrap.server";

export interface McpServerEntry {
  command?: string[];
  enabled?: boolean;
  type?: string;
  url?: string;
}

export interface OpencodeConfig {
  $schema?: string;
  mcp?: Record<string, McpServerEntry>;
}

const getConfigPath = (): string => join(getProjectRoot(), "opencode.json");
const getTmuxConfigStatePath = (): string =>
  join(getProjectRoot(), "runtime", TMUX_TRANSPORT_CONFIG_STATE_FILE);

function hashConfig(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function readAppliedTmuxConfigHash(): string | null {
  const path = getTmuxConfigStatePath();
  if (!existsSync(path)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
      appliedConfigHash?: unknown;
      version?: unknown;
    };
    return parsed.version === 1 && typeof parsed.appliedConfigHash === "string"
      ? parsed.appliedConfigHash
      : null;
  } catch {
    return null;
  }
}

function writeAppliedTmuxConfigHash(appliedConfigHash: string): void {
  const path = getTmuxConfigStatePath();
  mkdirSync(join(getProjectRoot(), "runtime"), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        version: 1,
        appliedConfigHash,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

export function readMcpConfig(): { config: OpencodeConfig | null; error?: string } {
  try {
    const configPath = getConfigPath();
    if (!existsSync(configPath)) {
      return { config: null, error: `opencode.json not found at ${configPath}` };
    }

    const raw = readFileSync(configPath, "utf-8");
    const config: OpencodeConfig = JSON.parse(raw);
    return { config };
  } catch (error) {
    return {
      config: null,
      error: `Failed to parse opencode.json: ${String(error)}`,
    };
  }
}

export function writeMcpServerEnabled(name: string, enabled: boolean) {
  try {
    const root = getProjectRoot();
    const configPath = getConfigPath();
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as OpencodeConfig;

    if (!(config.mcp && name in config.mcp)) {
      return { error: `MCP server "${name}" not found` };
    }

    const previousConfigHash = hashConfig(raw);
    config.mcp[name] = { ...config.mcp[name], enabled };

    const nextRaw = `${JSON.stringify(config, null, 2)}\n`;
    writeFileSync(configPath, nextRaw, "utf-8");

    if (readAppConfig(root).transportMode === "tmux-resident") {
      writeAppliedTmuxConfigHash(readAppliedTmuxConfigHash() ?? previousConfigHash);
    }

    return { success: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}