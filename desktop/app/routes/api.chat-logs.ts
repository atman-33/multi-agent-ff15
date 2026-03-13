import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import type { ChatLogRecord } from "@/lib/chat-timeline";
import { getProjectRoot } from "@/lib/get-project-root.server";

const CHAT_LOG_PATH = "runtime/logs/agent-chat-monitor.jsonl";

/**
 * GET /api/chat-logs?limit=100&cursor=<number>&agent=<agent-id>
 * Returns { records, next_cursor, total_lines }
 * Mirrors the Tauri `read_agent_chat_logs` command.
 */
export function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const agent = url.searchParams.get("agent") ?? "";
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
    const cursorParam = url.searchParams.get("cursor");
    const cursor =
      cursorParam !== null ? Number.parseInt(cursorParam, 10) : null;

    const root = getProjectRoot();
    const logPath = join(root, CHAT_LOG_PATH);

    if (!existsSync(logPath)) {
      return Response.json({
        records: [],
        next_cursor: 0,
        total_lines: 0,
        reset: cursor !== null && cursor > 0,
      });
    }

    const lines = readFileSync(logPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim() !== "");
    const filtered = lines
      .map((line) => {
        try {
          return JSON.parse(line) as ChatLogRecord;
        } catch {
          return null;
        }
      })
      .filter(
        (record): record is ChatLogRecord =>
          record !== null && (!agent || record.agent === agent)
      );
    const totalLines = filtered.length;

    const isTruncated = cursor !== null && cursor > totalLines;
    let start = 0;
    if (cursor !== null && !isTruncated) {
      start = cursor;
    } else if (totalLines > limit) {
      start = totalLines - limit;
    }

    const records = filtered.slice(start, start + limit);

    return Response.json({
      records,
      next_cursor: start + records.length,
      total_lines: totalLines,
      reset: isTruncated,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
