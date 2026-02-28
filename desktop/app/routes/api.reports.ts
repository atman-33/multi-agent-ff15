import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import yaml from "yaml";
import { getProjectRoot } from "@/lib/get-project-root.server";

export interface ReportMeta {
  author: string;
  date: string;
  filename: string;
  tags: string[];
  title: string;
}
const FM_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;
const FILENAME_REGEX = /^([^-]+)-([^-]+)-(.*)\.md$/;
const DATE8_REGEX = /^\d{8}$/;

export function loader({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const archived = url.searchParams.get("archived") === "true";
    const root = getProjectRoot();
    const reportsDir = archived
      ? join(root, "docs", "reports", "archive")
      : join(root, "docs", "reports");

    if (!existsSync(reportsDir)) {
      return Response.json({ reports: [] });
    }

    const files = readdirSync(reportsDir).filter((f) => f.endsWith(".md"));
    const reports: ReportMeta[] = [];

    for (const file of files) {
      const filePath = join(reportsDir, file);
      const content = readFileSync(filePath, "utf-8");

      const meta: Partial<ReportMeta> = { filename: file, tags: [] };

      // Try to parse frontmatter
      const fmMatch = content.match(FM_REGEX);
      if (fmMatch) {
        try {
          const parsed = yaml.parse(fmMatch[1]);
          if (parsed && typeof parsed === "object") {
            if (parsed.title) {
              meta.title = parsed.title;
            }
            if (parsed.author) {
              meta.author = parsed.author;
            }
            if (parsed.date) {
              meta.date = parsed.date;
            }
            if (Array.isArray(parsed.tags)) {
              meta.tags = parsed.tags;
            }
          }
        } catch (e) {
          console.warn(`Failed to parse frontmatter in ${file}`, e);
        }
      }

      // Fallbacks from filename if not found in frontmatter
      // e.g. analysis-ignis-20260215.md
      const nameMatch = file.match(FILENAME_REGEX);
      if (nameMatch) {
        if (!meta.author) {
          meta.author = nameMatch[2];
        }
        if (!meta.title) {
          meta.title = `${nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1)} Report (${nameMatch[2]})`;
        }
        if (!meta.date) {
          // try to parse timestamp from filename if it's something like 20260215
          const tsString = nameMatch[3];
          if (DATE8_REGEX.test(tsString)) {
            // Not standard ISO, but can be formatted roughly
            const y = tsString.slice(0, 4);
            const m = tsString.slice(4, 6);
            const d = tsString.slice(6, 8);
            meta.date = new Date(`${y}-${m}-${d}T00:00:00Z`).toISOString();
          }
        }
      }

      if (!meta.title) {
        meta.title = file.replace(".md", "");
      }
      if (!meta.author) {
        meta.author = "Unknown";
      }

      if (!meta.date) {
        const stats = statSync(filePath);
        meta.date = stats.mtime.toISOString();
      }

      reports.push(meta as ReportMeta);
    }

    // Sort descending by date (newest first)
    reports.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return Response.json({ reports });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
