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

    expect(existsSync(settingsPath)).toBe(true);
    expect(existsSync(join(root, "config", "current_projects.yaml"))).toBe(false);
    expect(readFileSync(settingsPath, "utf-8")).toContain("language: en");
    expect(readFileSync(settingsPath, "utf-8")).toContain('shared_skills_root: "skills"');
  });

  it("does not overwrite existing config files", () => {
    const root = createTempRoot();
    const configDir = join(root, "config");
    const settingsPath = join(configDir, "settings.yaml");

    ensureRequiredWebConfigFiles(root);
    writeFileSync(settingsPath, "language: ja\n", "utf-8");

    ensureRequiredWebConfigFiles(root);

    expect(readFileSync(settingsPath, "utf-8")).toBe("language: ja\n");
    expect(existsSync(join(configDir, "current_projects.yaml"))).toBe(false);
  });
});
