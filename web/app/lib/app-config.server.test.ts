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

    expect(readAppConfig(root)).toEqual({ language: "en" });
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

    const updated = writeAppConfig(root, { language: "ja" });

    expect(updated).toEqual({ language: "ja" });
    expect(readFileSync(settingsPath, "utf-8")).toContain("language: ja");
    expect(readFileSync(settingsPath, "utf-8")).toContain("theme: desert");
  });
});
