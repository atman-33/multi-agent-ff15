import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getProjectRoot } from "@/lib/getProjectRoot.server";

const ALLOWED_AGENTS = ["noctis", "lunafreya", "ignis", "gladiolus", "prompto"] as const;

type AllowedAgent = (typeof ALLOWED_AGENTS)[number];

function readModelOptions(root: string): string[] {
  const configPath = join(root, "config/model_switch_keywords.yaml");
  if (!existsSync(configPath)) return [];

  const raw = readFileSync(configPath, "utf-8");
  const parsed = parseYaml(raw) as { models?: unknown; };

  if (!Array.isArray(parsed?.models)) return [];

  return parsed.models
    .map((item) => {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).label === "string"
      ) {
        return (item as Record<string, string>).label;
      }
      return null;
    })
    .filter((item): item is string => item !== null);
}

/**
 * POST /api/model-switch
 * Body: { agent: AllowedAgent, label: string }
 */
export async function action({ request }: { request: Request; }) {
  try {
    const body = (await request.json()) as { agent?: string; label?: string; };
    const agent = body.agent?.trim() ?? "";
    const label = body.label?.trim() ?? "";

    if (!ALLOWED_AGENTS.includes(agent as AllowedAgent)) {
      return Response.json({ error: `Invalid agent: ${agent}` }, { status: 400 });
    }
    if (!label) {
      return Response.json({ error: "label is required" }, { status: 400 });
    }

    const root = getProjectRoot();
    const modelOptions = readModelOptions(root);
    if (!modelOptions.includes(label)) {
      return Response.json({ error: `Invalid model label: ${label}` }, { status: 400 });
    }

    const script = join(root, "scripts/switch-model.sh");
    const result = spawnSync("bash", [script, agent, label], {
      cwd: root,
      encoding: "utf-8",
      timeout: 10_000,
    });

    if (result.status === 0) {
      return Response.json({ ok: true });
    }

    const errorMessage = (result.stderr || result.stdout || "switch-model failed").trim();
    return Response.json({ error: errorMessage }, { status: 500 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
