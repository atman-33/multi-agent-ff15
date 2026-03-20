import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ActionFunctionArgs } from "react-router";

import { getProjectRoot } from "@/lib/get-project-root.server";

interface McpServerEntry {
  command?: string[];
  enabled?: boolean;
  type?: string;
  url?: string;
}

interface OpencodeConfig {
  $schema?: string;
  mcp?: Record<string, McpServerEntry>;
}

const getConfigPath = (): string => join(getProjectRoot(), "opencode.json");

const readConfig = (): { config: OpencodeConfig | null; error?: string } => {
  try {
    const configPath = getConfigPath();
    if (!existsSync(configPath)) {
      return { config: null, error: `opencode.json not found at ${configPath}` };
    }

    const raw = readFileSync(configPath, "utf-8");
    const config: OpencodeConfig = JSON.parse(raw);
    return { config };
  } catch (e) {
    return {
      config: null,
      error: `Failed to parse opencode.json: ${String(e)}`,
    };
  }
};

export const loader = () => {
  const { config, error } = readConfig();
  if (error) {
    return Response.json({ error }, { status: 500 });
  }
  return Response.json({ config });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { name, enabled } = body as { enabled: boolean; name: string };

    if (typeof name !== "string" || typeof enabled !== "boolean") {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { config, error } = readConfig();
    if (error || !config) {
      return Response.json({ error: error ?? "Failed to read config" }, { status: 500 });
    }

    if (!(config.mcp && name in config.mcp)) {
      return Response.json({ error: `MCP server "${name}" not found` }, { status: 404 });
    }

    config.mcp[name] = { ...config.mcp[name], enabled };
    writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
};
