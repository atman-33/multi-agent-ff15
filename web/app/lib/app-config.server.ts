import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { ensureRequiredWebConfigFiles } from "@/lib/required-config.server";

export interface AppConfig {
  executionWorkspaceRoot?: string;
  language: string;
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  language: "en",
};

function getSettingsPath(root: string): string {
  return join(root, "config", "settings.yaml");
}

function normalizeLanguage(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_APP_CONFIG.language;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : DEFAULT_APP_CONFIG.language;
}

function readAppConfigDocument(root: string) {
  ensureRequiredWebConfigFiles(root);
  const raw = readFileSync(getSettingsPath(root), "utf-8");
  const document = parseDocument(raw);

  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("\n"));
  }

  return document;
}

export function readAppConfig(root: string): AppConfig {
  const document = readAppConfigDocument(root);
  const parsed = document.toJSON() as Record<string, unknown> | null;
  const executionWorkspaceRoot =
    typeof parsed?.execution_workspace_root === "string" &&
    parsed.execution_workspace_root.trim().length > 0
      ? parsed.execution_workspace_root.trim()
      : undefined;

  return {
    ...(executionWorkspaceRoot ? { executionWorkspaceRoot } : {}),
    language: normalizeLanguage(parsed?.language),
  };
}

export function writeAppConfig(root: string, nextConfig: AppConfig): AppConfig {
  const language = normalizeLanguage(nextConfig.language);
  const document = readAppConfigDocument(root);

  document.set("language", language);
  if (
    typeof nextConfig.executionWorkspaceRoot === "string" &&
    nextConfig.executionWorkspaceRoot.trim().length > 0
  ) {
    document.set("execution_workspace_root", nextConfig.executionWorkspaceRoot.trim());
  } else {
    document.delete("execution_workspace_root");
  }
  writeFileSync(getSettingsPath(root), String(document), "utf-8");

  return readAppConfig(root);
}
