import yaml from "yaml";
import type { ResolvedSkillEntry } from "@/lib/operation-definition/types";
import {
  buildTextSection,
  buildXmlSection,
  joinXmlSections,
} from "@/lib/prompt-composition-engine/prompt-xml";

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function normalizeFileSkillEntry(
  content: string,
  filePath: string,
): ResolvedSkillEntry {
  const frontmatterMatch = content.match(FRONTMATTER_REGEX);
  if (!frontmatterMatch) {
    throw new Error(`Skill entry must define frontmatter with name and description: ${filePath}`);
  }

  try {
    const parsed = yaml.parse(frontmatterMatch[1]) as Record<string, unknown> | null;
    const name = typeof parsed?.name === "string" ? parsed.name.trim() : "";
    const description = typeof parsed?.description === "string" ? parsed.description.trim() : "";

    if (name && description) {
      return {
        name,
        description,
        file: filePath,
      };
    }
  } catch {
    throw new Error(`Skill entry has invalid frontmatter: ${filePath}`);
  }

  throw new Error(`Skill entry must define non-empty name and description: ${filePath}`);
}

function buildSkillEntryContent(entry: ResolvedSkillEntry): string {
  return joinXmlSections([
    buildTextSection("name", entry.name),
    buildTextSection("description", entry.description),
  ]);
}

export function buildSkillsCatalog(entries: readonly ResolvedSkillEntry[]): string | null {
  if (entries.length === 0) {
    return null;
  }

  const sections: string[] = [
    [
      "Use the skills below only when the current task matches their description.",
      "Do not assume every listed skill is relevant to the current turn.",
    ].join("\n"),
    joinXmlSections(entries.map((entry) => buildXmlSection("skill", buildSkillEntryContent(entry)))),
  ];

  return buildXmlSection("skills", sections.join("\n\n"));
}