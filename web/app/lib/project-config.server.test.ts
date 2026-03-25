import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
  getActiveProjectRootsForScope,
  readRegisteredProjectDefinition,
  readRegisteredProjects,
} from "./project-config.server";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-project-config-"));
  tempRoots.push(root);
  return root;
}

function writeProjectManifest(
  root: string,
  id: string,
  yamlContent: string
): void {
  const projectDir = join(root, "projects", id);
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(join(projectDir, "project.yaml"), yamlContent, "utf-8");
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("project-config.server", () => {
  it("reads registered projects from projects/<id>/project.yaml", () => {
    const root = createTempRoot();

    writeProjectManifest(
      root,
      "alpha",
      [
        'id: "alpha"',
        'name: "Alpha Project"',
        `root_path: "${root}/external-alpha"`,
        'serena_project: "alpha"',
        "instruction_files:",
        `  - path: "${root}/external-alpha/AGENTS.md"`,
        "    enabled: true",
        "",
      ].join("\n")
    );

    const projects = readRegisteredProjects(root);

    expect(projects).toEqual([
      {
        id: "alpha",
        displayName: "Alpha Project",
        path: `${root}/external-alpha`,
        branchName: undefined,
      },
    ]);
  });

  it("reads enabled instruction files and active roots from nested manifests", () => {
    const root = createTempRoot();
    mkdirSync(join(root, "config"), { recursive: true });
    writeFileSync(
      join(root, "config", "current_projects.yaml"),
      [
        "project_scopes:",
        "  noctis_team:",
        "    active_project_ids:",
        '      - "alpha"',
        "  lunafreya:",
        "    active_project_ids: []",
        'updated_at: "2026-03-25T00:00:00.000Z"',
        'updated_by: "test"',
        "",
      ].join("\n"),
      "utf-8"
    );

    const projectRoot = join(root, "external-alpha");
    mkdirSync(projectRoot, { recursive: true });

    writeProjectManifest(
      root,
      "alpha",
      [
        'id: "alpha"',
        'name: "Alpha Project"',
        `root_path: "${projectRoot}"`,
        'serena_project: "alpha"',
        "instruction_files:",
        `  - path: "${projectRoot}/AGENTS.md"`,
        "    enabled: true",
        `  - path: "${projectRoot}/CLAUDE.md"`,
        "    enabled: false",
        "",
      ].join("\n")
    );

    const definition = readRegisteredProjectDefinition(root, "alpha");

    expect(definition).toEqual({
      id: "alpha",
      name: "Alpha Project",
      rootPath: projectRoot,
      serenaProject: "alpha",
      instructionFiles: [
        { path: `${projectRoot}/AGENTS.md`, enabled: true },
        { path: `${projectRoot}/CLAUDE.md`, enabled: false },
      ],
    });

    expect(getActiveProjectRootsForScope(root, "noctis_team")).toEqual([projectRoot]);
  });
});