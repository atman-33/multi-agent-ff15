import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { ensureRequiredWebConfigFiles } from "@/lib/required-config.server";

export type AppLanguage = "ja" | "other";

export function readAppLanguage(): AppLanguage {
  try {
    const root = getProjectRoot();
    ensureRequiredWebConfigFiles(root);
    const configPath = join(root, "config", "settings.yaml");

    if (!existsSync(configPath)) {
      return "other";
    }

    const raw = readFileSync(configPath, "utf-8");
    const parsed = parseYaml(raw) as { language?: unknown } | null;

    return parsed?.language === "ja" ? "ja" : "other";
  } catch {
    return "other";
  }
}
