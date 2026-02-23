import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getProjectRoot } from "@/lib/get-project-root.server";

/**
 * GET /api/model-options
 * Returns whitelisted model labels for temporary runtime switch.
 */
export function loader() {
  try {
    const root = getProjectRoot();
    const configPath = join(root, "config/models.yaml");

    if (!existsSync(configPath)) {
      return Response.json({ modelOptions: [] satisfies string[] });
    }

    const raw = readFileSync(configPath, "utf-8");
    const parsed = parseYaml(raw) as {
      model_definitions?: Record<string, string>;
    };

    const modelOptions: string[] = parsed.model_definitions
      ? Object.values(parsed.model_definitions)
      : [];

    return Response.json({ modelOptions });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
