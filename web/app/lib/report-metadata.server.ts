import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdownDocument } from "@/lib/markdown-document.server";
import type {
  MarkdownDocumentDisplayMode,
  MarkdownDocumentFrontmatter,
} from "@/lib/types/markdown-document";

const DATE8_REGEX = /^\d{8}$/;
const FILENAME_REGEX = /^(.*?)-([a-zA-Z0-9_-]+)-(\d{8})(?:[-_].*)?\.md$/;
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const MARKDOWN_EXTENSION_REGEX = /\.md$/i;
const SAFE_REPORT_FILENAME_REGEX = /[^a-zA-Z0-9_.-]/g;

export interface ReportMeta {
  archived: boolean;
  author: string;
  date: string;
  filename: string;
  filePath: string;
  tags: string[];
  title: string;
}

export interface ReportDocument extends ReportMeta {
  content: string;
  displayMode: MarkdownDocumentDisplayMode;
  frontmatter: MarkdownDocumentFrontmatter | null;
  rawContent: string;
}

function buildReportPath(root: string, filename: string, archived: boolean) {
  return archived
    ? join(root, "docs", "reports", "archive", filename)
    : join(root, "docs", "reports", filename);
}

function parseReportDocument(
  filePath: string,
  filename: string,
  archived: boolean
): ReportDocument {
  const rawContent = readFileSync(filePath, "utf-8");
  const stats = statSync(filePath);

  let title = filename.replace(MARKDOWN_EXTENSION_REGEX, "");
  let author = "Unknown";
  let date = stats.mtime.toISOString();
  const tags: string[] = [];

  const nameMatch = filename.match(FILENAME_REGEX);
  if (nameMatch) {
    if (author === "Unknown") {
      author = nameMatch[2];
    }
    if (title === filename.replace(MARKDOWN_EXTENSION_REGEX, "")) {
      title = `${nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1)} Report (${nameMatch[2]})`;
    }
    if (!FRONTMATTER_REGEX.test(rawContent)) {
      const tsString = nameMatch[3];
      if (DATE8_REGEX.test(tsString)) {
        const year = tsString.slice(0, 4);
        const month = tsString.slice(4, 6);
        const day = tsString.slice(6, 8);
        date = new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
      }
    }
  }

  const parsed = parseMarkdownDocument(rawContent, {
    defaultMetadata: {
      title,
      author,
      date,
      tags,
    },
  });

  return {
    archived,
    author: parsed.metadata.author,
    content: parsed.content,
    date: parsed.metadata.date,
    displayMode: parsed.displayMode,
    filePath,
    filename,
    frontmatter: parsed.frontmatter,
    rawContent: parsed.rawContent,
    tags: parsed.metadata.tags,
    title: parsed.metadata.title,
  };
}

export function sanitizeReportFilename(filename: string) {
  return filename.replace(SAFE_REPORT_FILENAME_REGEX, "");
}

export function readReportDocument(
  root: string,
  filename: string,
  archived: boolean
): ReportDocument | null {
  const safeFilename = sanitizeReportFilename(filename);
  const filePath = buildReportPath(root, safeFilename, archived);

  if (!existsSync(filePath)) {
    return null;
  }

  return parseReportDocument(filePath, safeFilename, archived);
}

export function listReports(
  root: string,
  options: { includeArchived?: boolean } = {}
): ReportMeta[] {
  const includeArchived = options.includeArchived ?? false;
  const targets = [
    { archived: false, dir: join(root, "docs", "reports") },
    ...(includeArchived ? [{ archived: true, dir: join(root, "docs", "reports", "archive") }] : []),
  ];

  const reports: ReportMeta[] = [];

  for (const target of targets) {
    if (!existsSync(target.dir)) {
      continue;
    }

    for (const filename of readdirSync(target.dir).filter((file) => file.endsWith(".md"))) {
      reports.push(parseReportDocument(join(target.dir, filename), filename, target.archived));
    }
  }

  reports.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

  return reports;
}
