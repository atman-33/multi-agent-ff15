import { readAppConfig } from "@/lib/app-config.server";
import { getProjectRoot } from "@/lib/get-project-root.server";

export type AppLanguage = "ja" | "other";

export function readAppLanguage(): AppLanguage {
  try {
    const root = getProjectRoot();
    const parsed = readAppConfig(root);

    return parsed.language === "ja" ? "ja" : "other";
  } catch {
    return "other";
  }
}
