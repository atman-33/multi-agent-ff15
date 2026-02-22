import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import { getProjectRoot } from "@/lib/getProjectRoot.server";

const INBOX_LOG_PATH = "runtime/logs/inbox-log.jsonl";

export interface InboxLogRecord {
  id: string;
  ts: string;
  from: string;
  to: string;
  type: string;
  content: string;
}

/**
 * GET /api/inbox-log?agent=<noctis|lunafreya>&cursor=<number>
 * Returns { records: InboxLogRecord[], next_cursor: number, total_lines: number }
 * Filters by `to` field (messages received by the given agent).
 * Mirrors the Tauri `read_inbox_log` command.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const agent = url.searchParams.get("agent") ?? "";
    const cursorParam = url.searchParams.get("cursor");
    const cursor = cursorParam !== null ? parseInt(cursorParam, 10) : null;
    const LIMIT = 200;

    const root = getProjectRoot();
    const logPath = join(root, INBOX_LOG_PATH);

    if (!existsSync(logPath)) {
      return Response.json({ records: [], next_cursor: 0, total_lines: 0 });
    }

    const allLines = readFileSync(logPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim() !== "");
    const totalLines = allLines.length;

    const filtered = allLines
      .map((line) => {
        try {
          return JSON.parse(line) as InboxLogRecord;
        } catch {
          return null;
        }
      })
      .filter(
        (r): r is InboxLogRecord => r !== null && (!agent || r.to === agent)
      );

    const start = cursor !== null ? cursor : Math.max(0, filtered.length - LIMIT);
    const slice = filtered.slice(start, start + LIMIT);
    const nextCursor = start + slice.length;

    return Response.json({ records: slice, next_cursor: nextCursor, total_lines: totalLines });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
