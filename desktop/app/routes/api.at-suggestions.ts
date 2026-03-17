import { type Dirent, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { getActiveProjectRootsForScope } from "@/lib/project-config.server";
import {
  getProjectScopeForAgent,
  PROJECT_SCOPE_LABELS,
  type ProjectScopedAgentId,
} from "@/lib/project-scopes";
import { listReports } from "@/lib/report-metadata.server";

interface AtSuggestion {
  archived?: boolean;
  description?: string;
  insertText: string;
  label: string;
  source: "file" | "folder" | "report";
  value: string;
}

function searchProjectFiles(roots: string[], query: string): AtSuggestion[] {
  const IGNORE_DIRS = ["node_modules", ".git", "dist", "build", ".tmp"];
  const MAX_RESULTS = 50;
  const MAX_DIRS_EXPLORED = 1000;
  const MAX_DEPTH = 10;

  const results: AtSuggestion[] = [];
  const seenValues = new Set<string>();
  const qStr = query.toLowerCase();

  for (const root of roots) {
    if (results.length >= MAX_RESULTS) {
      break;
    }

    let dirsExplored = 0;

    // BFS queue: [directoryPath, depth]
    const queue: [string, number][] = [[root, 0]];

    while (
      queue.length > 0 &&
      results.length < MAX_RESULTS &&
      dirsExplored < MAX_DIRS_EXPLORED
    ) {
      const item = queue.shift();
      if (!item) {
        continue;
      }
      const [dir, depth] = item;
      if (!existsSync(dir)) {
        continue;
      }

      dirsExplored++;

      let entries: Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (results.length >= MAX_RESULTS) {
          break;
        }
        if (IGNORE_DIRS.includes(entry.name)) {
          continue;
        }
        if (entry.name.startsWith(".") && entry.name !== ".opencode") {
          continue;
        }

        const fullPath = join(dir, entry.name);
        const isDir = entry.isDirectory();
        const relPath = relative(root, fullPath);

        if (
          (qStr === "" || relPath.toLowerCase().includes(qStr)) &&
          !seenValues.has(fullPath)
        ) {
          seenValues.add(fullPath);
          results.push({
            label: relPath,
            value: fullPath,
            insertText: fullPath,
            source: isDir ? "folder" : "file",
          });
        }

        if (isDir && depth < MAX_DEPTH) {
          queue.push([fullPath, depth + 1]);
        }
      }
    }
  }

  // Sort results: exact matches (or shorter paths) first
  results.sort((a, b) => a.label.length - b.label.length);

  return results;
}

function searchReports(appRoot: string, query: string): AtSuggestion[] {
  const qStr = query.trim().toLowerCase();
  const reports = listReports(appRoot, { includeArchived: true });

  const matches = reports.filter((report) => {
    if (!qStr) {
      return true;
    }

    return [report.title, report.filename, report.author, ...report.tags].some(
      (value) => value.toLowerCase().includes(qStr)
    );
  });

  matches.sort((left, right) => {
    const leftStarts = `${left.title} ${left.filename}`
      .toLowerCase()
      .startsWith(qStr)
      ? 1
      : 0;
    const rightStarts = `${right.title} ${right.filename}`
      .toLowerCase()
      .startsWith(qStr)
      ? 1
      : 0;

    if (leftStarts !== rightStarts) {
      return rightStarts - leftStarts;
    }

    return new Date(right.date).getTime() - new Date(left.date).getTime();
  });

  return matches.slice(0, 12).map((report) => ({
    archived: report.archived,
    description: `${report.archived ? "Archived" : "Active"} report${report.author ? ` · ${report.author}` : ""}`,
    insertText: report.filePath,
    label: report.title,
    source: "report",
    value: report.filePath,
  }));
}

/**
 * GET /api/at-suggestions?q=foo
 * Returns file/folder suggestions based on the provided query.
 */
export function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const agent = (url.searchParams.get("agent") ?? "") as ProjectScopedAgentId;

    const appRoot = getProjectRoot();
    const scope = getProjectScopeForAgent(agent);
    if (scope === null) {
      return Response.json({ projectScopeLabel: null, suggestions: [] });
    }

    const roots = getActiveProjectRootsForScope(appRoot, scope);
    const projectSuggestions = searchProjectFiles(roots, q);
    const reportSuggestions = searchReports(appRoot, q);
    const suggestions = [...reportSuggestions, ...projectSuggestions];

    return Response.json({
      projectScopeLabel: PROJECT_SCOPE_LABELS[scope],
      suggestions,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
