import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getProjectRoot } from "@/lib/get-project-root.server";

export function loader() {
  try {
    const root = getProjectRoot();
    const configPath = join(root, "config/models.yaml");

    if (!existsSync(configPath)) {
      return Response.json({ modes: [] });
    }

    const raw = readFileSync(configPath, "utf-8");
    const parsed = parseYaml(raw) as { modes?: Record<string, any> };

    if (!parsed.modes) {
      return Response.json({ modes: [] });
    }

    const modes = Object.entries(parsed.modes).map(([key, value]) => ({
      name: key,
      description: value._description || "",
    }));

    return Response.json({ modes });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
