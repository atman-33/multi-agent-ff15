import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { SkillsPage, loader } from "./route";

const TestPage = SkillsPage as unknown as (props: { loaderData: unknown }) => ReactNode;

const originalRootEnv = process.env.MULTI_AGENT_FF15_ROOT;
const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-skills-route-"));
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
      "description: Manage project execution work.",
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
      "description: Review current implementation state.",
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

describe("skills route", () => {
  it("loads shared skills state for the initial render", async () => {
    const root = createTempRoot();
    process.env.MULTI_AGENT_FF15_ROOT = root;

    await expect(loader({} as never)).resolves.toEqual({
      initialData: {
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
      },
      initialFetchError: null,
    });
  });

  it("renders broken-selection warnings and discovered skill cards", () => {
    const markup = renderToStaticMarkup(
      <TestPage
        loaderData={{
          initialData: {
            invalidSelections: [{ id: "missing-skill", reason: "missing" }],
            selection: { selectedSkillIds: ["project-manage", "missing-skill"] },
            selectionPath: "config/shared-skills.yaml",
            settingsPath: "config/settings.yaml",
            sharedSkillsRoot: "skills",
            skills: [
              {
                description: "Manage project execution work.",
                filePath: "/repo/skills/project-manage/SKILL.md",
                id: "project-manage",
                name: "project-manage",
              },
              {
                description: "Review current implementation state.",
                filePath: "/repo/skills/team/core/reviewer/SKILL.md",
                id: "team/core/reviewer",
                name: "reviewer",
              },
            ],
          },
          initialFetchError: null,
        }}
      />,
    );

    expect(markup).toContain("Broken saved selections");
    expect(markup).toContain("Current root");
    expect(markup).toContain("skills");
    expect(markup).toContain("missing-skill");
    expect(markup).toContain("project-manage");
    expect(markup).toContain("team/core/reviewer");
    expect(markup).toContain("Enabled");
    expect(markup).not.toContain("Save Root");
  });

  it("does not render empty-selection guidance when no shared skills are enabled", () => {
    const markup = renderToStaticMarkup(
      <TestPage
        loaderData={{
          initialData: {
            invalidSelections: [],
            selection: { selectedSkillIds: [] },
            selectionPath: "config/shared-skills.yaml",
            settingsPath: "config/settings.yaml",
            sharedSkillsRoot: "skills",
            skills: [
              {
                description: "Manage project execution work.",
                filePath: "/repo/skills/project-manage/SKILL.md",
                id: "project-manage",
                name: "project-manage",
              },
            ],
          },
          initialFetchError: null,
        }}
      />,
    );

    expect(markup).not.toContain("No shared skills are currently enabled.");
    expect(markup).not.toContain(
      "Prompts will continue without shared skill references until you enable one.",
    );
    expect(markup).toContain("Current root");
  });
});