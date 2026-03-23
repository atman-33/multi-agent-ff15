import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";

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
  const { config, error } = readMcpConfig();
  if (error || !config) {
    return { error: error ?? "Failed to read config" };
  }

  if (!(config.mcp && name in config.mcp)) {
    return { error: `MCP server "${name}" not found` };
  }

  config.mcp[name] = { ...config.mcp[name], enabled };
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
  return { success: true as const };
}