import { type Dirent, existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import { getActiveProjectRootsForScope } from "@/lib/project-config.server";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { getProjectScopeForAgent, type ProjectScopedAgentId } from "@/lib/project-scopes";

function searchFiles(
  roots: string[],
  query: string
): {
  label: string;
  value: string;
  insertText: string;
  source: "file" | "folder";
}[] {
  const IGNORE_DIRS = ["node_modules", ".git", "dist", "build", ".tmp"];
  const MAX_RESULTS = 50;
  const MAX_DIRS_EXPLORED = 1000;
  const MAX_DEPTH = 10;

  const results: {
    label: string;
    value: string;
    insertText: string;
    source: "file" | "folder";
  }[] = [];
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

        // Exact filename match or path includes query
        if (qStr === "" || relPath.toLowerCase().includes(qStr)) {
          // We differentiate by prefixing folder/file to UI (optional)
          results.push({
            label: relPath, // relative path shown in UI
            value: fullPath,
            insertText: fullPath, // inserted
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
    const roots = getActiveProjectRootsForScope(appRoot, scope);
    if (scope === null) {
      return Response.json({ suggestions: [] });
    }
    const suggestions = searchFiles(roots, q);

    return Response.json({ suggestions });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
