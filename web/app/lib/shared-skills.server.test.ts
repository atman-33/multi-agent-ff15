import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
  listSharedSkillCatalogEntries,
  readSharedSkillsSelection,
  resolveSelectedSharedSkills,
  writeSharedSkillsSelection,
} from "./shared-skills.server";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-shared-skills-"));
  tempRoots.push(root);
  return root;
}

function writeSkill(root: string, relativeDirectory: string, name: string, description: string) {
  const directory = join(root, relativeDirectory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `description: ${description}`,
      "---",
      "# Skill body",
      "",
      "Body text should not matter.",
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
});

describe("shared-skills.server", () => {
  it("returns an empty selection until config/shared-skills.yaml exists and then persists selected ids", () => {
    const root = createTempRoot();

    expect(readSharedSkillsSelection(root)).toEqual({ selectedSkillIds: [] });

    const updated = writeSharedSkillsSelection(root, {
      selectedSkillIds: ["team/core/reviewer", "project-manage", "team/core/reviewer"],
    });

    expect(updated).toEqual({
      selectedSkillIds: ["team/core/reviewer", "project-manage"],
    });
    expect(readSharedSkillsSelection(root)).toEqual({
      selectedSkillIds: ["team/core/reviewer", "project-manage"],
    });
  });

  it("recursively discovers shared skills and exposes root-relative ids", () => {
    const root = createTempRoot();

    writeSkill(root, "skills/project-manage", "project-manage", "Manage project execution work.");
    writeSkill(root, "skills/team/core/reviewer", "reviewer", "Review current implementation state.");
    mkdirSync(join(root, "skills", "empty-directory"), { recursive: true });

    expect(listSharedSkillCatalogEntries(root)).toEqual([
      {
        description: "Manage project execution work.",
        filePath: join(root, "skills", "project-manage", "SKILL.md"),
        id: "project-manage",
        name: "project-manage",
      },
      {
        description: "Review current implementation state.",
        filePath: join(root, "skills", "team", "core", "reviewer", "SKILL.md"),
        id: "team/core/reviewer",
        name: "reviewer",
      },
    ]);
  });

  it("resolves valid selected skills and reports broken selections without failing", () => {
    const root = createTempRoot();

    writeSkill(root, "skills/project-manage", "project-manage", "Manage project execution work.");
    mkdirSync(join(root, "skills", "broken-skill"), { recursive: true });
    writeFileSync(
      join(root, "skills", "broken-skill", "SKILL.md"),
      ["---", "name: broken-skill", "---", "# Missing description", ""].join("\n"),
      "utf-8",
    );

    const resolved = resolveSelectedSharedSkills(root, [
      "project-manage",
      "missing-skill",
      "broken-skill",
    ]);

    expect(resolved.validEntries).toEqual([
      {
        description: "Manage project execution work.",
        file: join(root, "skills", "project-manage", "SKILL.md"),
        name: "project-manage",
      },
    ]);
    expect(resolved.invalidSelections).toEqual([
      {
        id: "missing-skill",
        reason: "missing",
      },
      {
        id: "broken-skill",
        reason: "invalid",
      },
    ]);
  });
});