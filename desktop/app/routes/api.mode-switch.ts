import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getProjectRoot } from "@/lib/get-project-root.server";

/**
 * POST /api/mode-switch
 * Body: { mode: string }
 */
export async function action({ request }: { request: Request }) {
  try {
    const body = (await request.json()) as { mode?: string };
    const modeName = body.mode?.trim();

    if (!modeName) {
      return Response.json({ error: "mode is required" }, { status: 400 });
    }

    const root = getProjectRoot();
    const configPath = join(root, "config/models.yaml");

    if (!existsSync(configPath)) {
      return Response.json({ error: "models.yaml not found" }, { status: 500 });
    }

    const raw = readFileSync(configPath, "utf-8");
    const parsed = parseYaml(raw) as {
      model_definitions?: Record<string, string>;
      modes?: Record<string, any>;
    };

    if (!parsed.modes?.[modeName]) {
      return Response.json(
        { error: `Invalid mode: ${modeName}` },
        { status: 400 }
      );
    }

    const modelDefinitions = parsed.model_definitions || {};
    const modeConfig = parsed.modes[modeName];
    const script = join(root, "scripts/switch-model.sh");

    const results: any[] = [];
    const agents = Object.keys(modeConfig).filter((k) => k !== "_description");

    for (const agent of agents) {
      const agentConfig = modeConfig[agent];
      if (agentConfig?.model) {
        const modelId = agentConfig.model;
        // Use exact keyword from model_definitions, or fallback to simple extraction
        let label = modelDefinitions[modelId];

        if (!label) {
          label = modelId.includes("/")
            ? modelId.split("/").at(-1) || modelId
            : modelId;
        }

        const proc = spawnSync("bash", [script, agent, label], {
          cwd: root,
          encoding: "utf-8",
          timeout: 10_000,
        });

        results.push({
          agent,
          modelId,
          keyword: label,
          status: proc.status,
          stdout: proc.stdout.trim(),
          stderr: proc.stderr.trim(),
        });
      }
    }

    const success = results.every((r) => r.status === 0);
    if (!success) {
      return Response.json(
        { error: "Some agents failed to switch", details: results },
        { status: 500 }
      );
    }

    return Response.json({ ok: true, mode: modeName, results });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
