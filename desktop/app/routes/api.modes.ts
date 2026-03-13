import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { ALL_MODEL_SWITCH_AGENTS } from "@/constants/agents";
import { getProjectRoot } from "@/lib/get-project-root.server";

type ModeConfig = {
  _description?: string;
} & Partial<Record<(typeof ALL_MODEL_SWITCH_AGENTS)[number], { model?: string }>>;

function modelsMatch(currentModel: string, expectedModel: string) {
  const current = currentModel.trim().toLowerCase();
  const expected = expectedModel.trim().toLowerCase();

  return (
    current === expected ||
    current.includes(expected) ||
    expected.includes(current)
  );
}

function inferActiveMode(
  root: string,
  modes: Record<string, ModeConfig>,
  modelDefinitions: Record<string, string>
) {
  const getModelScript = join(root, "scripts/get-current-model.sh");
  const currentModels = Object.fromEntries(
    ALL_MODEL_SWITCH_AGENTS.map((agent) => {
      const result = spawnSync("bash", [getModelScript, agent], {
        cwd: root,
        encoding: "utf-8",
        timeout: 2000,
      });

      return [agent, result.status === 0 ? result.stdout.trim() : ""];
    })
  ) as Record<(typeof ALL_MODEL_SWITCH_AGENTS)[number], string>;

  const matchedMode = Object.entries(modes).find(([, modeConfig]) =>
    ALL_MODEL_SWITCH_AGENTS.every((agent) => {
      const modelId = modeConfig[agent]?.model;
      if (!modelId) {
        return false;
      }

      const expectedLabel = modelDefinitions[modelId];
      const currentModel = currentModels[agent];
      if (!(expectedLabel && currentModel)) {
        return false;
      }

      return modelsMatch(currentModel, expectedLabel);
    })
  );

  return matchedMode?.[0] ?? "custom";
}

export function loader() {
  try {
    const root = getProjectRoot();
    const configPath = join(root, "config/models.yaml");

    if (!existsSync(configPath)) {
      return Response.json({ activeMode: "custom", modes: [] });
    }

    const raw = readFileSync(configPath, "utf-8");
    const parsed = parseYaml(raw) as {
      model_definitions?: Record<string, string>;
      modes?: Record<string, ModeConfig>;
    };

    if (!parsed.modes) {
      return Response.json({ activeMode: "custom", modes: [] });
    }

    const modes = Object.entries(parsed.modes).map(([key, value]) => ({
      name: key,
      description: value._description || "",
    }));

    const activeMode = inferActiveMode(
      root,
      parsed.modes,
      parsed.model_definitions || {}
    );

    return Response.json({ activeMode, modes });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
