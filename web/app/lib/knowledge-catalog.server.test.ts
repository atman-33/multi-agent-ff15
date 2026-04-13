import { describe, expect, it } from "vitest";

import {
  buildKnowledgeCatalog,
  normalizeFileKnowledgeEntry,
  normalizeInlineKnowledgeEntry,
} from "./knowledge-catalog.server";

describe("knowledge catalog", () => {
  it("normalizes file-backed reference metadata using name and description only", () => {
    const entry = normalizeFileKnowledgeEntry(
      [
        "---",
        "name: operation-system-contract",
        'description: Read when changing runtime-owned dispatch or report routing.',
        "critical:",
        "  - Runtime decides the next actor.",
        "---",
        "# Full contract body",
        "",
        "This text should not be injected into the prompt.",
      ].join("\n"),
      "/tmp/operation-system-contract.md",
    );

    expect(entry).toEqual({
      kind: "reference",
      name: "operation-system-contract",
      description: "Read when changing runtime-owned dispatch or report routing.",
      source: "/tmp/operation-system-contract.md",
    });
  });

  it("falls back to body-backed knowledge when required metadata is incomplete", () => {
    const entry = normalizeFileKnowledgeEntry(
      [
        "---",
        "name: broken-reference",
        "---",
        "# Broken reference body",
        "",
        "Fallback to body-backed knowledge.",
      ].join("\n"),
      "/tmp/broken-reference.md",
    );

    expect(entry).toEqual({
      kind: "body",
      content: ["# Broken reference body", "", "Fallback to body-backed knowledge."].join("\n"),
    });
  });

  it("renders one attribute-free knowledge catalog with reference and body entries", () => {
    const catalog = buildKnowledgeCatalog([
      normalizeFileKnowledgeEntry(
        [
          "---",
          "name: operation-system-contract",
          'description: Read when changing runtime-owned dispatch or report routing.',
          "critical:",
          "  - Runtime decides the next actor.",
          "---",
          "# Full contract body",
          "",
          "This text should not be injected into the prompt.",
        ].join("\n"),
        "/tmp/operation-system-contract.md",
      ),
      normalizeFileKnowledgeEntry(
        [
          "---",
          "name: broken-reference",
          "---",
          "# Broken reference body",
          "",
          "Fallback to body-backed knowledge.",
        ].join("\n"),
        "/tmp/broken-reference.md",
      ),
      normalizeInlineKnowledgeEntry("Prefer runtime-owned dispatch."),
    ]);

    expect(catalog).toContain("<knowledge-catalog>");
    expect(catalog).toContain("<knowledge-ref>");
    expect(catalog).toContain("<knowledge-body>");
    expect(catalog).toContain("Name: operation-system-contract");
    expect(catalog).toContain("Description: Read when changing runtime-owned dispatch or report routing.");
    expect(catalog).toContain("Source: /tmp/operation-system-contract.md");
    expect(catalog).not.toContain("Critical facts:");
    expect(catalog).not.toContain("This text should not be injected into the prompt.");
  });
});