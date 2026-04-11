import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
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
    const projectRoot = join(root, "external-alpha");
    mkdirSync(projectRoot, { recursive: true });

    writeProjectManifest(
      root,
      "alpha",
      [
        'id: "alpha"',
        'name: "Alpha Project"',
        'root_path: "../../external-alpha"',
        'serena_project: "alpha"',
        "instruction_files:",
        '  - path: "../../external-alpha/AGENTS.md"',
        "    enabled: true",
        "",
      ].join("\n")
    );

    const projects = readRegisteredProjects(root);

    expect(projects).toEqual([
      {
        id: "alpha",
        displayName: "Alpha Project",
        path: projectRoot,
        branchName: undefined,
      },
    ]);
  });

  it("reads enabled instruction files from nested manifests", () => {
    const root = createTempRoot();
    const projectRoot = join(root, "external-alpha");
    mkdirSync(projectRoot, { recursive: true });

    writeProjectManifest(
      root,
      "alpha",
      [
        'id: "alpha"',
        'name: "Alpha Project"',
        'root_path: "../../external-alpha"',
        'serena_project: "alpha"',
        "instruction_files:",
        '  - path: "../../external-alpha/AGENTS.md"',
        "    enabled: true",
        '  - path: "../../external-alpha/CLAUDE.md"',
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
  });

  it("keeps supporting absolute paths in project manifests", () => {
    const root = createTempRoot();
    const projectRoot = join(root, "external-beta");
    mkdirSync(projectRoot, { recursive: true });

    writeProjectManifest(
      root,
      "beta",
      [
        'id: "beta"',
        'name: "Beta Project"',
        `root_path: "${projectRoot}"`,
        'instruction_files:',
        `  - path: "${projectRoot}/AGENTS.md"`,
        '    enabled: true',
        '',
      ].join("\n")
    );

    expect(readRegisteredProjectDefinition(root, "beta")).toEqual({
      id: "beta",
      name: "Beta Project",
      rootPath: projectRoot,
      serenaProject: "",
      instructionFiles: [{ path: `${projectRoot}/AGENTS.md`, enabled: true }],
    });
  });

  it("reads execution workspace defaults from project manifests", () => {
    const root = createTempRoot();
    const projectRoot = join(root, "external-gamma");
    mkdirSync(projectRoot, { recursive: true });

    writeProjectManifest(
      root,
      "gamma",
      [
        'id: "gamma"',
        'name: "Gamma Project"',
        'root_path: "../../external-gamma"',
        'default_base_branch: "develop"',
        "",
      ].join("\n")
    );

    expect(readRegisteredProjectDefinition(root, "gamma")).toEqual({
      id: "gamma",
      name: "Gamma Project",
      rootPath: projectRoot,
      serenaProject: "",
      instructionFiles: [],
      defaultBaseBranch: "develop",
    });

    expect(readRegisteredProjects(root)).toEqual([
      {
        id: "gamma",
        displayName: "Gamma Project",
        path: projectRoot,
        branchName: undefined,
        defaultBaseBranch: "develop",
      },
    ]);
  });
});