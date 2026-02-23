import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import { getProjectRoot } from "@/lib/getProjectRoot.server";

const CHAT_LOG_PATH = "runtime/logs/agent-chat-monitor.jsonl";

interface ChatLogRecord {
  id: string;
  ts: string;
  agent: string;
  source: string;
  kind: string;
  content: string;
  session_id: string;
  meta: { pane: string; event: string; };
}

/**
 * GET /api/chat-logs?limit=100&cursor=<number>
 * Returns { records, next_cursor, total_lines }
 * Mirrors the Tauri `read_agent_chat_logs` command.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
    const cursorParam = url.searchParams.get("cursor");
    const cursor = cursorParam !== null ? parseInt(cursorParam, 10) : null;

    const root = getProjectRoot();
    const logPath = join(root, CHAT_LOG_PATH);

    if (!existsSync(logPath)) {
      return Response.json({ records: [], next_cursor: 0, total_lines: 0 });
    }

    const lines = readFileSync(logPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim() !== "");
    const totalLines = lines.length;

    const isTruncated = cursor !== null && cursor > totalLines;
    const start =
      cursor !== null && !isTruncated
        ? cursor
        : totalLines > limit
          ? totalLines - limit
          : 0;

    const slice = lines.slice(start, start + limit);

    const records: ChatLogRecord[] = slice
      .map((line) => {
        try {
          return JSON.parse(line) as ChatLogRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is ChatLogRecord => r !== null);

    return Response.json({
      records,
      next_cursor: start + slice.length,
      total_lines: totalLines,
      reset: isTruncated,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
