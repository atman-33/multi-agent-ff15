import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { action, loader } from "./api.config";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-api-config-"));
  tempRoots.push(root);

  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  writeFileSync(
    join(root, "config", "settings.yaml"),
    [
      'language: "en"',
      'execution_workspace_root: "../custom-workspaces"',
      'shared_skills_root: "../shared-skills"',
      'theme: "desert"',
      "",
    ].join("\n"),
    "utf-8",
  );

  return root;
}

afterEach(() => {
  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("api.config", () => {
  it("loads existing config fields including shared skills root", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const response = loader();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      config: {
        executionWorkspaceRoot: "../custom-workspaces",
        language: "en",
        sharedSkillsRoot: "../shared-skills",
        transportMode: "app-owned",
      },
      settingsPath: "config/settings.yaml",
    });
  });

  it("preserves unrelated config fields when updating language", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const response = await action({
      request: new Request("http://localhost/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            language: "ja",
          },
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      config: {
        executionWorkspaceRoot: "../custom-workspaces",
        language: "ja",
        sharedSkillsRoot: "../shared-skills",
        transportMode: "app-owned",
      },
      settingsPath: "config/settings.yaml",
      success: true,
    });

    const savedSettings = readFileSync(join(root, "config", "settings.yaml"), "utf-8");

    expect(savedSettings).toContain('execution_workspace_root: "../custom-workspaces"');
    expect(savedSettings).toContain('shared_skills_root: "../shared-skills"');
    expect(savedSettings).toContain('theme: "desert"');
  });

  it("updates shared skills root through the config api", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const response = await action({
      request: new Request("http://localhost/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            language: "en",
            sharedSkillsRoot: "external-skills",
          },
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      config: {
        executionWorkspaceRoot: "../custom-workspaces",
        language: "en",
        sharedSkillsRoot: "external-skills",
        transportMode: "app-owned",
      },
      settingsPath: "config/settings.yaml",
      success: true,
    });

    const savedSettings = readFileSync(join(root, "config", "settings.yaml"), "utf-8");

    expect(savedSettings).toContain('shared_skills_root: "external-skills"');
  });
});