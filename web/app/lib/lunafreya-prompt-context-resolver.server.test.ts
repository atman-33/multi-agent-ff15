import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveLunafreyaPromptContext } from "./lunafreya-prompt-context-resolver.server";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "multi-agent-ff15-luna-prompt-context-"));
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

describe("resolveLunafreyaPromptContext", () => {
  it("resolves the implicit default Job without emitting skill tags", () => {
    const root = createTempRoot();

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

    const resolved = resolveLunafreyaPromptContext({
      root,
      builtinLanguages: ["ja"],
      selectedSkillIds: [],
    });

    expect(resolved.selection).toMatchObject({
      selectedSkillIds: [],
    });
    expect(resolved.selection.selectedJobId).toBeUndefined();
    expect(resolved.selectedJobLabel).toBe("Default (Lunafreya Autonomous)");
    expect(resolved.promptExtension).toContain("<job>");
    expect(resolved.promptExtension).toContain("Lunafreya Autonomous");
    expect(resolved.promptExtension).not.toContain("<lunafreya-overlays>");
    expect(resolved.promptExtension).not.toContain("<lunafreya-job-overlay");
    expect(resolved.promptExtension).not.toContain("<skills>");
  });

  it("uses the selected Job as the only effective job and renders shared skills", () => {
    const root = createTempRoot();

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

    const resolved = resolveLunafreyaPromptContext({
      root,
      builtinLanguages: ["ja"],
      selectedJobId: "builtin:ja:jobs/strategist.md",
      selectedSkillIds: ["builtin:ja:skills/oracle-notes"],
    });

    expect(resolved.selection.selectedJobId).toBe("builtin:ja:jobs/strategist.md");
    expect(resolved.selectedJobLabel).toBe("Strategic Advisor");
    expect(resolved.promptExtension).toContain("<job>");
    expect(resolved.promptExtension).toContain("Strategic Advisor");
    expect(resolved.promptExtension).not.toContain("Guide User directly.");
    expect(resolved.promptExtension).toContain("<skills>");
    expect(resolved.promptExtension).toContain("<skill>");
    expect(resolved.promptExtension).toContain("<name>");
    expect(resolved.promptExtension).toContain("oracle-notes");
    expect(resolved.promptExtension).toContain("<description>");
    expect(resolved.promptExtension).toContain("<file>");
    expect(resolved.promptExtension).toContain(
      "If a listed skill is relevant, read the file at the absolute path in <file> and treat that file as the source of truth.",
    );
    expect(resolved.promptExtension).toContain(
      join(root, "builtins", "ja", "facets", "skills", "oracle-notes", "SKILL.md"),
    );
    expect(resolved.promptExtension).not.toContain("<lunafreya-job-overlay");
  });
});