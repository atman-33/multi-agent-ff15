import yaml from "yaml";
import type {
  MarkdownDocumentDisplayMode,
  MarkdownDocumentFrontmatter,
  MarkdownDocumentMetadata,
  MarkdownDocumentPreview,
} from "@/lib/types/markdown-document";

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseMarkdownDocument(
  rawContent: string,
  options: { defaultMetadata: MarkdownDocumentMetadata },
): MarkdownDocumentPreview {
  const frontmatterMatch = rawContent.match(FRONTMATTER_REGEX);
  const content = frontmatterMatch ? rawContent.substring(frontmatterMatch[0].length) : rawContent;

  let frontmatter: MarkdownDocumentFrontmatter | null = null;
  const metadata: MarkdownDocumentMetadata = { ...options.defaultMetadata };

  if (frontmatterMatch) {
    try {
      const parsed = yaml.parse(frontmatterMatch[1]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        frontmatter = parsed as MarkdownDocumentFrontmatter;

        if (typeof parsed.title === "string" && parsed.title.trim()) {
          metadata.title = parsed.title.trim();
        }
        if (typeof parsed.author === "string" && parsed.author.trim()) {
          metadata.author = parsed.author.trim();
        }
        if (parsed.date) {
          metadata.date = String(parsed.date);
        }
        if (Array.isArray(parsed.tags)) {
          metadata.tags = parsed.tags
            .filter((tag: unknown): tag is string => typeof tag === "string")
            .map((tag: string) => tag.trim())
            .filter(Boolean);
        }
      }
    } catch {
      frontmatter = null;
    }
  }

  let displayMode: MarkdownDocumentDisplayMode = "empty";
  if (content.trim()) {
    displayMode = "markdown";
  } else if (frontmatter && Object.keys(frontmatter).length > 0) {
    displayMode = "metadata-only";
  }

  return {
    content,
    rawContent,
    frontmatter,
    displayMode,
    metadata,
  };
}