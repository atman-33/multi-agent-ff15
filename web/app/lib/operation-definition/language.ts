import { readAppConfig } from "@/lib/app-config.server";
import { getProjectRoot } from "@/lib/get-project-root.server";

export function readOperationLanguage(): string {
  try {
    const config = readAppConfig(getProjectRoot());
    return config.language || "en";
  } catch {
    return "en";
  }
}