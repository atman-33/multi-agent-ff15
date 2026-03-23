import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { getOpencodeClient } from "@/lib/opencode-client";
import type { ModelSelection } from "@/lib/types/mission";

const PRESET_AGENT_IDS = ["noctis", "ignis", "gladiolus", "prompto"] as const;

type PresetAgentId = (typeof PRESET_AGENT_IDS)[number];

type ProviderRecord = {
  id?: string;
  models?: Record<string, { id?: string }>;
};

type ModeConfig = {
  _description?: string;
} & Partial<Record<PresetAgentId, { model?: string }>>;

function parseModelReference(value: unknown): ModelSelection | null {
  if (typeof value !== "string") {
    return null;
  }

  const slashIndex = value.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= value.length - 1) {
    return null;
  }

  return {
    providerID: value.slice(0, slashIndex),
    modelID: value.slice(slashIndex + 1),
  };
}

function humanizeModeName(modeId: string): string {
  if (modeId === "fullpower") {
    return "Full Power";
  }

  const spaced = modeId.replace(/[-_]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

async function getAvailableModels(): Promise<Set<string> | null> {
  try {
    const client = getOpencodeClient();
    const result = await client.config.providers();

    if (result.error || !result.data || !Array.isArray(result.data.providers)) {
      return null;
    }

    const availableModels = new Set<string>();

    for (const provider of result.data.providers as ProviderRecord[]) {
      if (typeof provider.id !== "string") {
        continue;
      }

      for (const model of Object.values(provider.models ?? {})) {
        if (typeof model?.id !== "string") {
          continue;
        }

        availableModels.add(`${provider.id}/${model.id}`);
      }
    }

    return availableModels;
  } catch {
    return null;
  }
}

export const loader = async () => {
  const root = getProjectRoot();
  const configPath = join(root, "config/models.yaml");

  if (!existsSync(configPath)) {
    return Response.json({ presets: [] });
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = parseYaml(raw) as {
    modes?: Record<string, ModeConfig>;
  };
  const availableModels = await getAvailableModels();

  const presets = Object.entries(parsed.modes ?? {}).map(([modeId, modeConfig]) => {
    const agentModels = Object.fromEntries(
      PRESET_AGENT_IDS.map((agentId) => [agentId, parseModelReference(modeConfig[agentId]?.model)])
    ) as Partial<Record<PresetAgentId, ModelSelection>>;

    const incompleteAgents = PRESET_AGENT_IDS.filter((agentId) => !agentModels[agentId]);
    const unavailableAgents =
      availableModels === null
        ? []
        : PRESET_AGENT_IDS.filter((agentId) => {
            const model = agentModels[agentId];
            if (!model) {
              return false;
            }

            return !availableModels.has(`${model.providerID}/${model.modelID}`);
          });

    return {
      id: modeId,
      label: humanizeModeName(modeId),
      description: modeConfig._description ?? "",
      available: incompleteAgents.length === 0 && unavailableAgents.length === 0,
      unavailableAgents,
      agentModels,
    };
  });

  return Response.json({ presets });
};
