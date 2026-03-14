import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "yaml";

const DATE8_REGEX = /^\d{8}$/;
const FILENAME_REGEX = /^(.*?)-([a-zA-Z0-9_-]+)-(\d{8})(?:[-_].*)?\.md$/;
const FM_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface ReportMeta {
  archived: boolean;
  author: string;
  date: string;
  filePath: string;
  filename: string;
  tags: string[];
  title: string;
}

export interface ReportDocument extends ReportMeta {
  content: string;
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

  let content = rawContent;
  let title = filename.replace(/\.md$/i, "");
  let author = "Unknown";
  let date = stats.mtime.toISOString();
  let tags: string[] = [];

  const fmMatch = rawContent.match(FM_REGEX);
  if (fmMatch) {
    content = rawContent.substring(fmMatch[0].length);
    try {
      const parsed = yaml.parse(fmMatch[1]);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.title === "string" && parsed.title.trim()) {
          title = parsed.title.trim();
        }
        if (typeof parsed.author === "string" && parsed.author.trim()) {
          author = parsed.author.trim();
        }
        if (parsed.date) {
          date = String(parsed.date);
        }
        if (Array.isArray(parsed.tags)) {
          tags = parsed.tags
            .filter((tag: unknown): tag is string => typeof tag === "string")
            .map((tag: string) => tag.trim())
            .filter(Boolean);
        }
      }
    } catch {
      // Ignore malformed frontmatter and keep fallback metadata.
    }
  }

  const nameMatch = filename.match(FILENAME_REGEX);
  if (nameMatch) {
    if (author === "Unknown") {
      author = nameMatch[2];
    }
    if (title === filename.replace(/\.md$/i, "")) {
      title = `${nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1)} Report (${nameMatch[2]})`;
    }
    if (!fmMatch) {
      const tsString = nameMatch[3];
      if (DATE8_REGEX.test(tsString)) {
        const year = tsString.slice(0, 4);
        const month = tsString.slice(4, 6);
        const day = tsString.slice(6, 8);
        date = new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
      }
    }
  }

  return {
    archived,
    author,
    content,
    date,
    filePath,
    filename,
    rawContent,
    tags,
    title,
  };
}

export function sanitizeReportFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9_.-]/g, "");
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
    ...(includeArchived
      ? [{ archived: true, dir: join(root, "docs", "reports", "archive") }]
      : []),
  ];

  const reports: ReportMeta[] = [];

  for (const target of targets) {
    if (!existsSync(target.dir)) {
      continue;
    }

    for (const filename of readdirSync(target.dir).filter((file) =>
      file.endsWith(".md")
    )) {
      reports.push(
        parseReportDocument(join(target.dir, filename), filename, target.archived)
      );
    }
  }

  reports.sort(
    (left, right) =>
      new Date(right.date).getTime() - new Date(left.date).getTime()
  );

  return reports;
}