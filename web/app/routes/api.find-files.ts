import { type Dirent, existsSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { Route } from "./+types/api.find-files";

type FindEntry = {
  path: string;
  label: string;
  isFolder: boolean;
};

const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".tmp"]);
const MAX_RESULTS = 60;
const MAX_DIRS_EXPLORED = 1200;
const MAX_DEPTH = 10;

function getSearchRoot(): string {
  const cwd = process.cwd();
  return basename(cwd) === "web" ? join(cwd, "..") : cwd;
}

function collectEntries(root: string, query: string): FindEntry[] {
  const q = query.toLowerCase();
  const results: FindEntry[] = [];
  const seen = new Set<string>();
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  let dirsExplored = 0;

  while (
    queue.length > 0 &&
    results.length < MAX_RESULTS &&
    dirsExplored < MAX_DIRS_EXPLORED
  ) {
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

      const fullPath = join(current.dir, entry.name);
      const relPath = relative(root, fullPath);
      const normalizedRelPath = relPath.replaceAll("\\", "/");
      const isFolder = entry.isDirectory();

      if ((q === "" || normalizedRelPath.toLowerCase().includes(q)) && !seen.has(normalizedRelPath)) {
        seen.add(normalizedRelPath);
        results.push({
          path: normalizedRelPath,
          label: isFolder ? `${normalizedRelPath}/` : normalizedRelPath,
          isFolder,
        });
      }

      if (isFolder && current.depth < MAX_DEPTH) {
        queue.push({ dir: fullPath, depth: current.depth + 1 });
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
    const root = getSearchRoot();
    const entries = collectEntries(root, query);
    return Response.json({ files: entries });
  } catch {
    return Response.json({ files: [] }, { status: 503 });
  }
};
