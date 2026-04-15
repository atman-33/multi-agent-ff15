import { describe, expect, it } from "vitest";

import {
  buildSkillsCatalog,
  normalizeFileSkillEntry,
} from "./skill-catalog.server";

describe("skill catalog", () => {
  it("normalizes file-backed skill metadata using name, description, and file only", () => {
    const entry = normalizeFileSkillEntry(
      [
        "---",
        "name: operation-system-contract",
        'description: Read when changing runtime-owned dispatch or report routing.',
        'argument-hint: runtime dispatch',
        "---",
        "# Full contract body",
        "",
        "This text should not be injected into the prompt.",
      ].join("\n"),
      "/tmp/operation-system-contract/SKILL.md",
    );

    expect(entry).toEqual({
      name: "operation-system-contract",
      description: "Read when changing runtime-owned dispatch or report routing.",
      file: "/tmp/operation-system-contract/SKILL.md",
    });
  });

  it("rejects skill files with incomplete metadata", () => {
    expect(() =>
      normalizeFileSkillEntry(
        [
          "---",
          "name: broken-skill",
          "---",
          "# Broken skill body",
        ].join("\n"),
        "/tmp/broken-skill/SKILL.md",
      ),
    ).toThrow(/name and description/i);
  });

  it("renders one attribute-free skills section with name, description, and file only", () => {
    const catalog = buildSkillsCatalog([
      normalizeFileSkillEntry(
        [
          "---",
          "name: operation-system-contract",
          'description: Read when changing runtime-owned dispatch or report routing.',
          "---",
          "# Full contract body",
          "",
          "This text should not be injected into the prompt.",
        ].join("\n"),
        "/tmp/operation-system-contract/SKILL.md",
      ),
      normalizeFileSkillEntry(
        [
          "---",
          "name: agent-relationships",
          'description: Read when you need a compact FF15 relationship cue.',
          "---",
          "# Agent relationships",
        ].join("\n"),
        "/tmp/agent-relationships/SKILL.md",
      ),
    ]);

    expect(catalog).toContain("<reference-files>");
    expect(catalog).toContain("<reference-file>");
    expect(catalog).toContain("<name>");
    expect(catalog).toContain("operation-system-contract");
    expect(catalog).toContain("agent-relationships");
    expect(catalog).toContain("<description>");
    expect(catalog).toContain("<file>");
    expect(catalog).toContain("/tmp/operation-system-contract/SKILL.md");
    expect(catalog).toContain("/tmp/agent-relationships/SKILL.md");
    expect(catalog).toContain(
      "If a listed skill is relevant, read the file at the absolute path in <file> and treat that file as the source of truth.",
    );
    expect(catalog).not.toContain("argument-hint");
    expect(catalog).not.toContain("This text should not be injected into the prompt.");
  });
});
