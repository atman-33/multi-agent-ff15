import { type Dirent, existsSync, readdirSync } from "node:fs";
import { basename, relative } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { readRegisteredProjects } from "@/lib/project-config.server";
import type { Route } from "./+types/api.find-files";

type FindEntry = {
  description?: string;
  path: string;
  label: string;
  isFolder: boolean;
};

type SearchRoot = {
  root: string;
  projectName: string | null;
};

const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".tmp"]);
const MAX_RESULTS = 60;
const MAX_DIRS_EXPLORED = 1200;
const MAX_DEPTH = 10;

function getSearchRoots(appRoot: string): SearchRoot[] {
  const roots = new Map<string, SearchRoot>([[appRoot, { root: appRoot, projectName: null }]]);

  for (const project of readRegisteredProjects(appRoot)) {
    if (!project.path) {
      continue;
    }

    roots.set(project.path, {
      root: project.path,
      projectName: project.displayName || basename(project.path),
    });
  }

  return Array.from(roots.values());
}

function collectEntries(searchRoots: SearchRoot[], appRoot: string, query: string): FindEntry[] {
  const q = query.toLowerCase();
  const results: FindEntry[] = [];
  const seen = new Set<string>();

  for (const { root, projectName } of searchRoots) {
    if (!existsSync(root)) {
      continue;
    }

    const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
    let dirsExplored = 0;

    while (queue.length > 0 && results.length < MAX_RESULTS && dirsExplored < MAX_DIRS_EXPLORED) {
      const current = queue.shift();
      if (!current) break;
      if (!existsSync(current.dir)) continue;

      dirsExplored += 1;

      let entries: Dirent[];
      try {
        entries = readdirSync(current.dir, { withFileTypes: true }) as Dirent[];
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (results.length >= MAX_RESULTS) break;
        if (IGNORE_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".")) continue;

        const fullPath = `${current.dir}/${entry.name}`;
        const relPath = relative(root, fullPath);
        const normalizedRelPath = relPath.replaceAll("\\", "/");
        const isFolder = entry.isDirectory();
        const normalizedFullPath = fullPath.replaceAll("\\", "/");
        const path = root === appRoot ? normalizedRelPath : normalizedFullPath;
        const matchesQuery =
          q === "" ||
          normalizedRelPath.toLowerCase().includes(q) ||
          (projectName ? projectName.toLowerCase().includes(q) : false);

        if (matchesQuery && !seen.has(path)) {
          seen.add(path);
          const label = normalizedRelPath;
          results.push({
            description: projectName ?? undefined,
            path,
            label: isFolder ? `${label}/` : label,
            isFolder,
          });
        }

        if (isFolder && current.depth < MAX_DEPTH) {
          queue.push({ dir: fullPath, depth: current.depth + 1 });
        }
      }
    }
  }

  results.sort((left, right) => {
    if (left.isFolder !== right.isFolder) {
      return left.isFolder ? -1 : 1;
    }
    return left.path.length - right.path.length;
  });

  return results;
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  try {
    const root = getProjectRoot();
    const searchRoots = getSearchRoots(root);
    const entries = collectEntries(searchRoots, root, query);
    return Response.json({ files: entries });
  } catch {
    return Response.json({ files: [] }, { status: 503 });
  }
};
