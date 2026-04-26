import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveCanonicalPinnedSkill } from "./pinned-skill.server";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-pinned-skill-"));
  tempRoots.push(root);
  return root;
}

function writePinnedSkill(root: string, skillName: string, content: string): string {
  const skillDir = join(root, ".opencode", "skills", skillName);
  mkdirSync(skillDir, { recursive: true });
  const filePath = join(skillDir, "SKILL.md");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("pinned-skill server", () => {
  it("resolves a canonical pinned skill into prompt context", () => {
    const root = createTempRoot();
    const filePath = writePinnedSkill(
      root,
      "operation-customization",
      [
        "---",
        "name: operation-customization",
        "description: Use this skill for operation authoring changes.",
        "---",
        "",
        "# Operation Customization",
      ].join("\n"),
    );

    expect(
      resolveCanonicalPinnedSkill(root, {
        skillName: "operation-customization",
        unavailableError: "Pinned operation-customization skill is unavailable.",
      }),
    ).toEqual({
      available: true,
      error: null,
      filePath,
      promptContext: expect.stringContaining("operation-customization"),
    });
  });

  it("returns an unavailable state when the canonical pinned skill file is missing", () => {
    const root = createTempRoot();

    expect(
      resolveCanonicalPinnedSkill(root, {
        skillName: "operation-customization",
        unavailableError: "Pinned operation-customization skill is unavailable.",
      }),
    ).toEqual({
      available: false,
      error: "Pinned operation-customization skill is unavailable.",
      filePath: null,
      promptContext: null,
    });
  });

  it("returns an unavailable state when the canonical pinned skill file is invalid", () => {
    const root = createTempRoot();
    writePinnedSkill(root, "operation-customization", "# Missing frontmatter\n");

    expect(
      resolveCanonicalPinnedSkill(root, {
        skillName: "operation-customization",
        unavailableError: "Pinned operation-customization skill is unavailable.",
      }),
    ).toEqual({
      available: false,
      error: "Pinned operation-customization skill is unavailable.",
      filePath: null,
      promptContext: null,
    });
  });
});