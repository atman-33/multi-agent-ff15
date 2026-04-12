import yaml from "yaml";
import type { ResolvedKnowledgeEntry } from "@/lib/operation-definition/types";
import {
  buildMarkdownSection,
  buildXmlSection,
  joinXmlSections,
} from "@/lib/prompt-composition-engine/prompt-xml";

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function normalizeInlineKnowledgeEntry(content: string): ResolvedKnowledgeEntry {
  return { kind: "body", content };
}

export function normalizeFileKnowledgeEntry(
  content: string,
  sourceReference: string,
): ResolvedKnowledgeEntry {
  const frontmatterMatch = content.match(FRONTMATTER_REGEX);

  if (!frontmatterMatch) {
    return { kind: "body", content };
  }

  const body = content.slice(frontmatterMatch[0].length);

  try {
    const parsed = yaml.parse(frontmatterMatch[1]);

    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.name === "string" &&
      parsed.name.trim().length > 0 &&
      typeof parsed.description === "string" &&
      parsed.description.trim().length > 0
    ) {
      return {
        kind: "reference",
        name: parsed.name.trim(),
        description: parsed.description.trim(),
        source: sourceReference,
      };
    }
  } catch {
    return { kind: "body", content: body };
  }

  return { kind: "body", content: body };
}

function buildKnowledgeReferenceContent(
  entry: Extract<ResolvedKnowledgeEntry, { kind: "reference" }>,
): string {
  return [
    `Name: ${entry.name}`,
    `Description: ${entry.description}`,
    `Source: ${entry.source}`,
  ].join("\n");
}

export function buildKnowledgeCatalog(entries: readonly ResolvedKnowledgeEntry[]): string | null {
  if (entries.length === 0) {
    return null;
  }

  const catalogEntries = entries.map((entry) =>
    entry.kind === "reference"
      ? buildMarkdownSection("knowledge-ref", buildKnowledgeReferenceContent(entry))
      : buildMarkdownSection("knowledge-body", entry.content),
  );

  const sections: string[] = [];

  if (entries.some((entry) => entry.kind === "reference")) {
    sections.push(
      [
        "Reference entries below are reference cards, not full knowledge documents.",
        "Read a source file only when the current task matches its description.",
      ].join("\n"),
    );
  }

  sections.push(joinXmlSections(catalogEntries));

  return buildXmlSection("knowledge-catalog", sections.join("\n\n"));
}