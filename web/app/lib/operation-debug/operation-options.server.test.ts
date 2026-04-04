import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildProjectOperationRef } from "@/lib/operation-definition/operation-catalog";
import {
  listOperationDebugOptions,
  listOperationDebugProjectFilterOptions,
  resolveOperationDebugLanguage,
} from "./operation-options.server";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(language: string): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operation-debug-options-"));
  tempRoots.push(root);

  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  writeFileSync(join(root, "config", "settings.yaml"), `language: ${language}\n`, "utf-8");

  return root;
}

function writeOperation(root: string, language: string, name: string, description: string): void {
  const operationsDirectory = join(root, "builtins", language, "operations");
  mkdirSync(operationsDirectory, { recursive: true });
  writeFileSync(
    join(operationsDirectory, `${name}.yaml`),
    [
      `name: ${name}`,
      `description: ${description}`,
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    job:",
      "      inline: Planner",
      "    instruction:",
      "      inline: Execute the plan",
      "    rules: []",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function writeActiveProjectConfig(root: string, projectIds: string[]): void {
  writeFileSync(
    join(root, "config", "current_projects.yaml"),
    [
      "project_scopes:",
      "  noctis_team:",
      projectIds.length > 0
        ? ["    active_project_ids:", ...projectIds.map((projectId) => `      - "${projectId}"`)].join("\n")
        : "    active_project_ids: []",
      "  lunafreya:",
      "    active_project_ids: []",
      'updated_at: "2026-04-05T00:00:00.000Z"',
      'updated_by: "test"',
      "",
    ].join("\n"),
    "utf-8",
  );
}

function writeProjectManifest(root: string, id: string, name: string): void {
  const projectDir = join(root, "projects", id);
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(projectDir, "project.yaml"),
    [
      `id: "${id}"`,
      `name: "${name}"`,
      `root_path: "../../external-${id}"`,
      `serena_project: "${id}"`,
      "",
    ].join("\n"),
    "utf-8",
  );
}

function writeProjectOperation(root: string, projectId: string, name: string, description: string): void {
  const operationsDirectory = join(root, "projects", projectId, "operations");
  mkdirSync(operationsDirectory, { recursive: true });
  writeFileSync(
    join(operationsDirectory, `${name}.yaml`),
    [
      `name: ${name}`,
      `description: ${description}`,
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    job:",
      "      inline: Project Planner",
      "    instruction:",
      "      inline: Execute the project workflow",
      "    rules: []",
      "",
    ].join("\n"),
    "utf-8",
  );
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }

  if (originalRootEnv === undefined) {
    delete process.env.MULTI_AGENT_FF15_ROOT;
  } else {
    process.env.MULTI_AGENT_FF15_ROOT = originalRootEnv;
  }
});

describe("operation-debug operation options", () => {
  it("uses ja operations when language is ja", () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "openspec-dev", "OpenSpec delivery flow.");
    writeOperation(root, "ja", "noctis-autonomous", "Default conversational flow.");

    expect(resolveOperationDebugLanguage()).toBe("ja");
    expect(listOperationDebugOptions().map((operation) => operation.value)).toEqual([
      "builtin:ja:noctis-autonomous.yaml",
      "builtin:ja:openspec-dev.yaml",
    ]);
  });

  it("uses only en operations when language is en and en builtins exist", () => {
    const root = createTempRoot("en");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "openspec-dev", "Japanese workflow.");
    writeOperation(root, "en", "noctis-autonomous", "Default conversational flow.");
    writeOperation(root, "en", "english-review", "English review workflow.");

    expect(resolveOperationDebugLanguage()).toBe("en");
    expect(listOperationDebugOptions().map((operation) => operation.value)).toEqual([
      "builtin:en:noctis-autonomous.yaml",
      "builtin:en:english-review.yaml",
    ]);
  });

  it("falls back to ja when language is en but en builtins are unavailable", () => {
    const root = createTempRoot("en");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "openspec-dev", "OpenSpec delivery flow.");
    writeOperation(root, "ja", "noctis-autonomous", "Default conversational flow.");

    expect(resolveOperationDebugLanguage()).toBe("ja");
    expect(listOperationDebugOptions().map((operation) => operation.value)).toEqual([
      "builtin:ja:noctis-autonomous.yaml",
      "builtin:ja:openspec-dev.yaml",
    ]);
  });

  it("includes active-project workflows in the union catalog and exposes project filters", () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "noctis-autonomous", "Default conversational flow.");
    writeOperation(root, "ja", "openspec-dev", "Builtin OpenSpec workflow.");
    writeProjectManifest(root, "alpha", "Alpha Project");
    writeActiveProjectConfig(root, ["alpha"]);
    writeProjectOperation(root, "alpha", "openspec-dev", "Alpha project workflow.");

    expect(listOperationDebugProjectFilterOptions()).toEqual([
      { value: "all", label: "All Active Projects" },
      { value: "alpha", label: "Alpha Project" },
    ]);
    expect(listOperationDebugOptions().map((operation) => operation.value)).toEqual([
      "builtin:ja:noctis-autonomous.yaml",
      "builtin:ja:openspec-dev.yaml",
      buildProjectOperationRef("alpha", "openspec-dev.yaml"),
    ]);
  });

  it("keeps builtin workflows visible while filtering project workflows to one active project", () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "noctis-autonomous", "Default conversational flow.");
    writeProjectManifest(root, "alpha", "Alpha Project");
    writeProjectManifest(root, "beta", "Beta Project");
    writeActiveProjectConfig(root, ["alpha", "beta"]);
    writeProjectOperation(root, "alpha", "repo-review", "Alpha review workflow.");
    writeProjectOperation(root, "beta", "repo-review", "Beta review workflow.");

    expect(listOperationDebugOptions("alpha").map((operation) => operation.value)).toEqual([
      "builtin:ja:noctis-autonomous.yaml",
      buildProjectOperationRef("alpha", "repo-review.yaml"),
    ]);
  });
});