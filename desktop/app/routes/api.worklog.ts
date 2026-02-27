import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";

interface WorklogEntry {
  agent: string;
  description?: string;
  status?: string;
  summary?: string;
  taskId: string;
  timestamp: string;
}

interface WorklogData {
  inProgress: WorklogEntry[];
  results: WorklogEntry[];
}

/**
 * GET /api/worklog
 * Returns the contents of runtime/worklog.json.
 */
export function loader() {
  try {
    const root = getProjectRoot();
    const worklogPath = join(root, "runtime/worklog.json");

    if (!existsSync(worklogPath)) {
      return Response.json({
        inProgress: [],
        results: [],
      } satisfies WorklogData);
    }

    const raw = readFileSync(worklogPath, "utf-8");
    const data = JSON.parse(raw) as WorklogData;

    return Response.json({
      inProgress: data.inProgress ?? [],
      results: data.results ?? [],
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
