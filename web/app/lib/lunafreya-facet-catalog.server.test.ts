import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  listLunafreyaFacetCatalogEntries,
  type LunafreyaFacetCatalogEntry,
} from "./lunafreya-facet-catalog.server";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-luna-facets-"));
  tempRoots.push(root);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  return root;
}

function writeFile(root: string, relativePath: string, content: string): void {
  const absolutePath = join(root, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf-8");
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("lunafreya facet catalog", () => {
  it("merges builtin and project-authored candidates with stable labels and non-recursive discovery", () => {
    const root = createTempRoot();

    writeFile(
      root,
      "builtins/ja/facets/jobs/reviewer.md",
      [
        "---",
        'name: Reviewer Role',
        'description: Review code and plans.',
        "---",
        "",
        "# Reviewer",
        "",
        "Review things.",
      ].join("\n"),
    );
    writeFile(
      root,
      "builtins/ja/facets/knowledge/agent-relationships.md",
      ["# Agent Relationships", "", "Reference knowledge."].join("\n"),
    );
    writeFile(
      root,
      "projects/alpha/project.yaml",
      [
        'id: "alpha"',
        'name: "Alpha Project"',
        'root_path: "../../workspace-alpha"',
        'serena_project: "alpha"',
        "",
      ].join("\n"),
    );
    writeFile(
      root,
      "projects/alpha/facets/jobs/domain-role.md",
      ["# Domain Role", "", "Project-specific job."].join("\n"),
    );
    writeFile(
      root,
      "projects/alpha/facets/jobs/nested/ignored.md",
      ["# Ignored Nested Job"].join("\n"),
    );
    writeFile(
      root,
      "projects/alpha/facets/knowledge/domain-notes.md",
      ["Plain body with no heading."].join("\n"),
    );
    writeFile(
      root,
      "projects/alpha/facets/knowledge/nested/ignored.md",
      ["# Ignored Nested Knowledge"].join("\n"),
    );

    const jobs = listLunafreyaFacetCatalogEntries({
      root,
      kind: "job",
      builtinLanguages: ["ja", "en"],
      executionProjectId: "alpha",
    });
    const knowledge = listLunafreyaFacetCatalogEntries({
      root,
      kind: "knowledge",
      builtinLanguages: ["ja", "en"],
      executionProjectId: "alpha",
    });

    expect(jobs).toEqual([
      expect.objectContaining<Partial<LunafreyaFacetCatalogEntry>>({
        id: "builtin:ja:jobs/reviewer.md",
        label: "Reviewer Role",
        description: "Review code and plans.",
        kind: "job",
        sourceKind: "builtin",
        sourceLabel: "Builtin",
      }),
      expect.objectContaining<Partial<LunafreyaFacetCatalogEntry>>({
        id: "project:alpha:jobs/domain-role.md",
        label: "Domain Role",
        kind: "job",
        sourceKind: "project",
        sourceLabel: "Alpha Project",
        projectId: "alpha",
      }),
    ]);

    expect(knowledge).toEqual([
      expect.objectContaining<Partial<LunafreyaFacetCatalogEntry>>({
        id: "builtin:ja:knowledge/agent-relationships.md",
        label: "Agent Relationships",
        kind: "knowledge",
        sourceKind: "builtin",
      }),
      expect.objectContaining<Partial<LunafreyaFacetCatalogEntry>>({
        id: "project:alpha:knowledge/domain-notes.md",
        label: "domain-notes",
        kind: "knowledge",
        sourceKind: "project",
      }),
    ]);
  });
});