import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildProjectOperationRef,
  listOperationCatalogEntriesForScope,
  loadOperationByRef,
} from "./operation-catalog";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operation-catalog-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  writeFileSync(join(root, "config", "settings.yaml"), "language: ja\n", "utf-8");
  return root;
}

function writeBuiltinOperation(root: string, language: string, fileName: string, name: string): void {
  const operationsDirectory = join(root, "builtins", language, "operations");
  mkdirSync(operationsDirectory, { recursive: true });
  writeFileSync(
    join(operationsDirectory, fileName),
    [
      `name: ${name}`,
      `description: ${name} description`,
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

function writeProjectManifest(root: string, projectId = "alpha"): void {
  const projectDir = join(root, "projects", projectId);
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(projectDir, "project.yaml"),
    [
      `id: "${projectId}"`,
      `name: "${projectId[0]?.toUpperCase() ?? "P"}${projectId.slice(1)} Project"`,
      `root_path: "../../external-${projectId}"`,
      `serena_project: "${projectId}"`,
      "",
    ].join("\n"),
    "utf-8",
  );
}

function writeProjectOperation(root: string, fileName: string, name: string, projectId = "alpha"): string {
  const operationsDirectory = join(root, "projects", projectId, "operations");
  mkdirSync(operationsDirectory, { recursive: true });
  const operationPath = join(operationsDirectory, fileName);
  writeFileSync(
    operationPath,
    [
      `name: ${name}`,
      `description: ${name} project description`,
      "initial_step: plan",
      "steps:",
      "  - name: plan",
      "    agent: noctis",
      "    job:",
      "      inline: Project planner",
      "    instruction:",
      "      file: ../facets/instructions/plan.md",
      "    rules: []",
      "",
    ].join("\n"),
    "utf-8",
  );
  mkdirSync(join(root, "projects", projectId, "facets", "instructions"), { recursive: true });
  writeFileSync(
    join(root, "projects", projectId, "facets", "instructions", "plan.md"),
    "Project-local instruction\n",
    "utf-8",
  );
  return operationPath;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("operation catalog", () => {
  it("includes registered project workflows alongside builtin workflows without collapsing same-name entries", () => {
    const root = createTempRoot();
    writeBuiltinOperation(root, "ja", "noctis-autonomous.yaml", "noctis-autonomous");
    writeBuiltinOperation(root, "ja", "openspec-dev.yaml", "openspec-dev");
    writeProjectManifest(root);
    writeProjectOperation(root, "openspec-dev.yaml", "openspec-dev");

    const entries = listOperationCatalogEntriesForScope({
      root,
      scope: "noctis_team",
      builtinLanguages: ["ja", "en"],
    });

    expect(entries.map((entry) => entry.ref)).toEqual([
      "builtin:ja:noctis-autonomous.yaml",
      "builtin:ja:openspec-dev.yaml",
      "project:alpha:openspec-dev.yaml",
    ]);
    expect(entries.filter((entry) => entry.name === "openspec-dev")).toHaveLength(2);
    expect(entries.find((entry) => entry.ref === "project:alpha:openspec-dev.yaml")).toMatchObject({
      sourceKind: "project",
      projectId: "alpha",
      projectName: "Alpha Project",
    });
  });

  it("loads project-authored workflows from the project definition directory convention path", () => {
    const root = createTempRoot();
    writeProjectManifest(root);
    const operationPath = writeProjectOperation(root, "repo-review.yaml", "repo-review");

    const operation = loadOperationByRef(buildProjectOperationRef("alpha", "repo-review.yaml"), root);

    expect(operation.name).toBe("repo-review");
    expect(operation.sourcePath).toBe(operationPath);
  });

  it("filters project-authored workflows to the selected registered project", () => {
    const root = createTempRoot();
    writeBuiltinOperation(root, "ja", "noctis-autonomous.yaml", "noctis-autonomous");
    writeProjectManifest(root, "alpha");
    writeProjectManifest(root, "beta");
    writeProjectOperation(root, "repo-review.yaml", "repo-review", "alpha");
    writeProjectOperation(root, "repo-debug.yaml", "repo-debug", "beta");
    const entries = listOperationCatalogEntriesForScope({
      root,
      scope: "noctis_team",
      projectFilterId: "alpha",
      builtinLanguages: ["ja", "en"],
    });

    expect(entries.map((entry) => entry.ref)).toEqual([
      "builtin:ja:noctis-autonomous.yaml",
      "project:alpha:repo-review.yaml",
    ]);
  });
});