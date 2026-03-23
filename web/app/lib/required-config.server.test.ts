import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { ensureRequiredWebConfigFiles } from "./required-config.server";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-web-config-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("ensureRequiredWebConfigFiles", () => {
  it("creates default required config files when they are missing", () => {
    const root = createTempRoot();

    ensureRequiredWebConfigFiles(root);

    const settingsPath = join(root, "config", "settings.yaml");
    const currentProjectsPath = join(root, "config", "current_projects.yaml");

    expect(existsSync(settingsPath)).toBe(true);
    expect(existsSync(currentProjectsPath)).toBe(true);
    expect(readFileSync(settingsPath, "utf-8")).toContain("language: en");
    expect(readFileSync(currentProjectsPath, "utf-8")).toContain("active_project_ids: []");
    expect(readFileSync(currentProjectsPath, "utf-8")).toContain('updated_at: ""');
  });

  it("does not overwrite existing config files", () => {
    const root = createTempRoot();
    const configDir = join(root, "config");
    const settingsPath = join(configDir, "settings.yaml");
    const currentProjectsPath = join(configDir, "current_projects.yaml");

    ensureRequiredWebConfigFiles(root);
    writeFileSync(settingsPath, "language: ja\n", "utf-8");
    writeFileSync(currentProjectsPath, 'updated_by: "tester"\n', "utf-8");

    ensureRequiredWebConfigFiles(root);

    expect(readFileSync(settingsPath, "utf-8")).toBe("language: ja\n");
    expect(readFileSync(currentProjectsPath, "utf-8")).toBe('updated_by: "tester"\n');
  });
});
