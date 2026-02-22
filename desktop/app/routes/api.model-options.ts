import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getProjectRoot } from "@/lib/getProjectRoot.server";

/**
 * GET /api/model-options
 * Returns whitelisted model labels for temporary runtime switch.
 */
export async function loader() {
  try {
    const root = getProjectRoot();
    const configPath = join(root, "config/model_switch_keywords.yaml");

    if (!existsSync(configPath)) {
      return Response.json({ modelOptions: [] satisfies string[] });
    }

    const raw = readFileSync(configPath, "utf-8");
    const parsed = parseYaml(raw) as { models?: unknown };

    const modelOptions: string[] = Array.isArray(parsed?.models)
      ? parsed.models
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
          .filter((item): item is string => item !== null)
      : [];

    return Response.json({ modelOptions });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
