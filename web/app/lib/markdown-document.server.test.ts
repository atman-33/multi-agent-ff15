import { describe, expect, it } from "vitest";

import { parseMarkdownDocument } from "./markdown-document.server";

describe("markdown-document.server", () => {
  it("classifies documents with frontmatter and body as markdown", () => {
    const document = parseMarkdownDocument(
      [
        "---",
        "title: Spec plan",
        "author: Noctis",
        "date: 2026-04-05T00:00:00.000Z",
        "tags:",
        "  - spec",
        "---",
        "",
        "# Plan",
        "",
        "Details.",
      ].join("\n"),
      {
        defaultMetadata: {
          title: "fallback-title",
          author: "fallback-author",
          date: "2026-04-09T00:00:00.000Z",
          tags: [],
        },
      },
    );

    expect(document.displayMode).toBe("markdown");
    expect(document.content).toContain("# Plan");
    expect(document.metadata).toEqual({
      title: "Spec plan",
      author: "Noctis",
      date: "2026-04-05T00:00:00.000Z",
      tags: ["spec"],
    });
  });

  it("classifies frontmatter-only documents as metadata-only and preserves frontmatter", () => {
    const document = parseMarkdownDocument(
      [
        "---",
        "title: News run plan",
        "change_name: shared-frontmatter-document-preview",
        "tags:",
        "  - planning",
        "  - noctis-team",
        "---",
        "",
      ].join("\n"),
      {
        defaultMetadata: {
          title: "fallback-title",
          author: "",
          date: "2026-04-09T00:00:00.000Z",
          tags: [],
        },
      },
    );

    expect(document.displayMode).toBe("metadata-only");
    expect(document.content).toBe("");
    expect(document.frontmatter).toMatchObject({
      title: "News run plan",
      change_name: "shared-frontmatter-document-preview",
      tags: ["planning", "noctis-team"],
    });
    expect(document.metadata).toEqual({
      title: "News run plan",
      author: "",
      date: "2026-04-09T00:00:00.000Z",
      tags: ["planning", "noctis-team"],
    });
  });

  it("falls back to readable body content when frontmatter is malformed", () => {
    const document = parseMarkdownDocument(
      [
        "---",
        "title: [unterminated",
        "---",
        "",
        "# Review",
        "",
        "Still readable.",
      ].join("\n"),
      {
        defaultMetadata: {
          title: "fallback-title",
          author: "fallback-author",
          date: "2026-04-09T00:00:00.000Z",
          tags: [],
        },
      },
    );

    expect(document.frontmatter).toBeNull();
    expect(document.displayMode).toBe("markdown");
    expect(document.content).toContain("# Review");
    expect(document.metadata).toEqual({
      title: "fallback-title",
      author: "fallback-author",
      date: "2026-04-09T00:00:00.000Z",
      tags: [],
    });
  });
});