import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { action, loader } from "./api.skills";

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-api-skills-"));
  tempRoots.push(root);

  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "config"), { recursive: true });
  mkdirSync(join(root, "skills", "project-manage"), { recursive: true });
  mkdirSync(join(root, "skills", "team", "core", "reviewer"), { recursive: true });
  writeFileSync(join(root, "opencode.json"), "{}\n", "utf-8");
  writeFileSync(join(root, "config", "settings.yaml"), 'language: en\nshared_skills_root: "skills"\n', "utf-8");
  writeFileSync(
    join(root, "config", "shared-skills.yaml"),
    ["selected_skill_ids:", '  - "project-manage"', '  - "missing-skill"', ""].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(root, "skills", "project-manage", "SKILL.md"),
    [
      "---",
      "name: project-manage",
      'description: Manage project execution work.',
      "---",
      "# Project Manage",
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(root, "skills", "team", "core", "reviewer", "SKILL.md"),
    [
      "---",
      "name: reviewer",
      'description: Review current implementation state.',
      "---",
      "# Reviewer",
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

describe("api.skills", () => {
  it("returns the shared skills catalog, selection, and invalid persisted selections", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const response = loader();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      invalidSelections: [{ id: "missing-skill", reason: "missing" }],
      selection: {
        selectedSkillIds: ["project-manage", "missing-skill"],
      },
      selectionPath: "config/shared-skills.yaml",
      settingsPath: "config/settings.yaml",
      sharedSkillsRoot: "skills",
      skills: [
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
      ],
    });
  });

  it("updates persisted selected ids without changing the configured shared skills root", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const response = await action({
      request: new Request("http://localhost/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedSkillIds: ["team/core/reviewer"],
        }),
      }),
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      invalidSelections: [],
      selection: {
        selectedSkillIds: ["team/core/reviewer"],
      },
      selectionPath: "config/shared-skills.yaml",
      settingsPath: "config/settings.yaml",
      sharedSkillsRoot: "skills",
      skills: [
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
      ],
      success: true,
    });
  });

  it("rejects attempts to update shared skills root through the skills api", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    const response = await action({
      request: new Request("http://localhost/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sharedSkillsRoot: "other-skills",
        }),
      }),
    } as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "sharedSkillsRoot is managed through /api/config",
    });
  });
});