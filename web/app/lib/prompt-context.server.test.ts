import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { buildInjectedPromptContext } from "./prompt-context.server";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-prompt-context-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("buildInjectedPromptContext", () => {
  it("injects only enabled and existing instruction files", () => {
    const root = createTempRoot();
    const projectRoot = join(root, "external-alpha");

    mkdirSync(join(root, "config"), { recursive: true });
    mkdirSync(join(root, "projects", "alpha"), { recursive: true });
    mkdirSync(projectRoot, { recursive: true });

    writeFileSync(join(projectRoot, "AGENTS.md"), "# Agents\n", "utf-8");
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
    writeFileSync(
      join(root, "projects", "alpha", "project.yaml"),
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
        '  - path: "../../external-alpha/GEMINI.md"',
        "    enabled: true",
        "",
      ].join("\n"),
      "utf-8"
    );

    const promptContext = buildInjectedPromptContext({
      agent: "noctis",
      appRoot: root,
      sessionId: "session-1",
    });

    expect(promptContext).toContain(`  - ${projectRoot}/AGENTS.md`);
    expect(promptContext).not.toContain(`${projectRoot}/CLAUDE.md`);
    expect(promptContext).not.toContain(`${projectRoot}/GEMINI.md`);
    expect(promptContext).toContain("<workspace-context");
    expect(promptContext).toContain(`project_root: ${projectRoot}`);
    expect(promptContext).toContain("<tooling-context");
    expect(promptContext).toContain("serena_project: alpha");
  });
});