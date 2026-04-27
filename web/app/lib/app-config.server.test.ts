import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { readAppConfig, writeAppConfig } from "./app-config.server";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-app-config-"));
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

describe("app-config.server", () => {
  it("reads the default language from the generated settings file", () => {
    const root = createTempRoot();

    expect(readAppConfig(root)).toEqual({
      language: "en",
      sharedSkillsRoot: "skills",
      transportMode: "app-owned",
    });
  });

  it("updates language without dropping unrelated settings", () => {
    const root = createTempRoot();
    const configDir = join(root, "config");
    const settingsPath = join(configDir, "settings.yaml");

    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      settingsPath,
      ["# custom settings", "language: en", "theme: desert", ""].join("\n"),
      "utf-8"
    );

    const updated = writeAppConfig(root, {
      language: "ja",
      transportMode: "app-owned",
      sharedSkillsRoot: "skills/shared",
    });

    expect(updated).toEqual({
      language: "ja",
      sharedSkillsRoot: "skills/shared",
      transportMode: "app-owned",
    });
    expect(readFileSync(settingsPath, "utf-8")).toContain("language: ja");
    expect(readFileSync(settingsPath, "utf-8")).toContain("shared_skills_root: skills/shared");
    expect(readFileSync(settingsPath, "utf-8")).toContain("theme: desert");
  });

  it("reads and writes an execution workspace root override", () => {
    const root = createTempRoot();
    const configDir = join(root, "config");
    const settingsPath = join(configDir, "settings.yaml");

    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      settingsPath,
      [
        "language: en",
        'execution_workspace_root: "../custom-workspaces"',
        'shared_skills_root: "../shared-skills"',
        "theme: desert",
        "",
      ].join("\n"),
      "utf-8"
    );

    expect(readAppConfig(root)).toEqual({
      language: "en",
      executionWorkspaceRoot: "../custom-workspaces",
      sharedSkillsRoot: "../shared-skills",
      transportMode: "app-owned",
    });

    const updated = writeAppConfig(root, {
      language: "ja",
      executionWorkspaceRoot: "../fresh-workspaces",
      transportMode: "app-owned",
      sharedSkillsRoot: "skills/catalog",
    });

    expect(updated).toEqual({
      language: "ja",
      executionWorkspaceRoot: "../fresh-workspaces",
      sharedSkillsRoot: "skills/catalog",
      transportMode: "app-owned",
    });
    expect(readFileSync(settingsPath, "utf-8")).toContain(
      'execution_workspace_root: "../fresh-workspaces"',
    );
    expect(readFileSync(settingsPath, "utf-8")).toContain('shared_skills_root: "skills/catalog"');
    expect(readFileSync(settingsPath, "utf-8")).toContain("theme: desert");
  });

  it("reads and writes a tmux transport mode override", () => {
    const root = createTempRoot();
    const configDir = join(root, "config");
    const settingsPath = join(configDir, "settings.yaml");

    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      settingsPath,
      [
        "language: en",
        'transport_mode: "tmux-resident"',
        'shared_skills_root: "skills"',
        "theme: desert",
        "",
      ].join("\n"),
      "utf-8"
    );

    expect(readAppConfig(root)).toEqual({
      language: "en",
      transportMode: "tmux-resident",
      sharedSkillsRoot: "skills",
    });

    const updated = writeAppConfig(root, {
      language: "ja",
      transportMode: "app-owned",
      sharedSkillsRoot: "skills/shared",
    });

    expect(updated).toEqual({
      language: "ja",
      transportMode: "app-owned",
      sharedSkillsRoot: "skills/shared",
    });
    expect(readFileSync(settingsPath, "utf-8")).toContain('transport_mode: "app-owned"');
    expect(readFileSync(settingsPath, "utf-8")).toContain("theme: desert");
  });
});
