export type MarkdownDocumentDisplayMode = "markdown" | "metadata-only" | "empty";

export type MarkdownDocumentFrontmatter = Record<string, unknown>;

export interface MarkdownDocumentMetadata {
  title: string;
  author: string;
  date: string;
  tags: string[];
}

export interface MarkdownDocumentPreview {
  content: string;
  rawContent: string;
  frontmatter: MarkdownDocumentFrontmatter | null;
  displayMode: MarkdownDocumentDisplayMode;
  metadata: MarkdownDocumentMetadata;
}