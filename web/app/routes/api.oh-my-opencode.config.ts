import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ActionFunctionArgs } from "react-router";

const CONFIG_PATH = join(homedir(), ".config/opencode/oh-my-opencode.json");

interface ModelEntry {
  model: string;
  variant?: string;
}

interface OhMyOpenCodeConfig {
  agents?: Record<string, ModelEntry>;
  categories?: Record<string, ModelEntry>;
}

const readVersion = (): { isInstalled: boolean; version: string } => {
  try {
    const version = execFileSync("oh-my-opencode", ["--version"], {
      encoding: "utf-8",
    }).trim();

    return { isInstalled: true, version };
  } catch {
    return { isInstalled: false, version: "unknown" };
  }
};

const readModels = (): string[] => {
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
};

const readConfig = (): { config: OhMyOpenCodeConfig | null; error?: string } => {
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
  } catch (e) {
    return {
      config: null,
      error: `Failed to parse config: ${String(e)}`,
    };
  }
};

export const loader = () => {
  const { isInstalled, version } = readVersion();
  const { config, error } = readConfig();
  const models = readModels();

  return Response.json({
    config,
    error,
    isInstalled,
    models,
    version,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    let config: unknown;
    const contentType = request.headers.get("Content-Type");

    if (contentType?.includes("application/json")) {
      const body = (await request.json()) as { config?: unknown };
      config = body.config;
    } else {
      const formData = await request.formData();
      const configValue = formData.get("config");
      if (typeof configValue === "string") {
        config = JSON.parse(configValue);
      }
    }

    if (!config || typeof config !== "object") {
      return Response.json({ error: "Missing config in request body" }, { status: 400 });
    }

    mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");

    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
};
