import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listOperationStudioOperationOptions,
  parseOperationStudioAuthoringTarget,
  resolveOperationStudioLunafreyaFacetCatalog,
} from "./catalog.server";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(language: string): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-operation-studio-catalog-"));
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

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
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

describe("operation-studio catalog", () => {
  it("normalizes builtin and project authoring targets", () => {
    expect(parseOperationStudioAuthoringTarget("builtin")).toEqual({
      kind: "builtin",
      projectId: null,
    });
    expect(parseOperationStudioAuthoringTarget("project:alpha")).toEqual({
      kind: "project",
      projectId: "alpha",
    });
  });

  it("uses builtin-only catalog for the builtin authoring target", () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "noctis-autonomous", "Default conversational flow.");
    writeProjectManifest(root, "alpha", "Alpha Project");
    writeProjectOperation(root, "alpha", "repo-review", "Alpha review workflow.");

    expect(
      listOperationStudioOperationOptions({
        scope: "noctis_team",
        target: parseOperationStudioAuthoringTarget("builtin"),
      }).map((operation) => operation.value),
    ).toEqual(["builtin:ja:noctis-autonomous.yaml"]);
  });

  it("uses builtin plus the selected project catalog for the project authoring target", () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeOperation(root, "ja", "noctis-autonomous", "Default conversational flow.");
    writeProjectManifest(root, "alpha", "Alpha Project");
    writeProjectManifest(root, "beta", "Beta Project");
    writeProjectOperation(root, "alpha", "repo-review", "Alpha review workflow.");
    writeProjectOperation(root, "beta", "repo-review", "Beta review workflow.");

    expect(
      listOperationStudioOperationOptions({
        scope: "noctis_team",
        target: parseOperationStudioAuthoringTarget("project:alpha"),
      }).map((operation) => operation.value),
    ).toEqual([
      "builtin:ja:noctis-autonomous.yaml",
      "project:alpha:repo-review.yaml",
    ]);
  });

  it("resolves Lunafreya facet catalogs from the same bound authoring target", () => {
    const root = createTempRoot("ja");
    process.env.MULTI_AGENT_FF15_ROOT = root;

    writeProjectManifest(root, "alpha", "Alpha Project");
    writeFile(
      root,
      "builtins/ja/facets/jobs/lunafreya-autonomous.md",
      [
        "---",
        'name: Default (Lunafreya Autonomous)',
        'description: Reserved default Lunafreya job.',
        "---",
        "",
        "# Lunafreya Autonomous",
        "",
        "Guide User directly.",
      ].join("\n"),
    );
    writeFile(
      root,
      "builtins/ja/facets/jobs/strategist.md",
      [
        "---",
        'name: Strategic Advisor',
        'description: Adds structured strategic framing.',
        "---",
        "",
        "# Strategic Advisor",
        "",
        "Structure the response as calm, high-signal guidance.",
      ].join("\n"),
    );
    writeFile(
      root,
      "builtins/ja/facets/skills/oracle-notes/SKILL.md",
      [
        "---",
        "name: oracle-notes",
        'description: Read when you need Lunafreya-specific long-horizon guidance.',
        "---",
        "",
        "# Oracle Notes",
      ].join("\n"),
    );
    writeFile(
      root,
      "projects/alpha/facets/jobs/domain-role.md",
      ["# Domain Role", "", "Project-specific job."].join("\n"),
    );
    writeFile(
      root,
      "projects/alpha/facets/skills/domain-notes/SKILL.md",
      [
        "---",
        "name: domain-notes",
        'description: Read this when project-specific terminology matters.',
        "---",
        "",
        "# Domain Notes",
      ].join("\n"),
    );

    const resolved = resolveOperationStudioLunafreyaFacetCatalog({
      target: parseOperationStudioAuthoringTarget("project:alpha"),
      selectedJobId: "project:alpha:jobs/domain-role.md",
      selectedSkillIds: ["project:alpha:skills/domain-notes"],
    });

    expect(resolved.jobOptions.map((option) => option.id)).toEqual([
      "builtin:ja:jobs/strategist.md",
      "project:alpha:jobs/domain-role.md",
    ]);
    expect(resolved.skillOptions.map((option) => option.id)).toEqual([
      "builtin:ja:skills/oracle-notes",
      "project:alpha:skills/domain-notes",
    ]);
    expect(resolved.selection.selectedJobId).toBe("project:alpha:jobs/domain-role.md");
    expect(resolved.selection.selectedSkillIds).toEqual(["project:alpha:skills/domain-notes"]);
    expect(resolved.promptExtension).toContain("Project-specific job.");
    expect(resolved.promptExtension).toContain("domain-notes");
  });
});