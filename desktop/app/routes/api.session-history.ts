import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import { ALLOWED_AGENTS } from "@/constants/agents";
import {
  buildSessionHistorySummaries,
  parseChatLogLines,
} from "@/lib/session-history";
import { getProjectRoot } from "@/lib/get-project-root.server";

const CHAT_LOG_PATH = "runtime/logs/agent-chat-monitor.jsonl";

export function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const agent = url.searchParams.get("agent") ?? "";

    if (!isAllowedAgent(agent)) {
      return Response.json({ error: `Invalid agent: ${agent}` }, { status: 400 });
    }

    const root = getProjectRoot();
    const logPath = join(root, CHAT_LOG_PATH);

    if (!existsSync(logPath)) {
      return Response.json({ summaries: [] });
    }

    const lines = readFileSync(logPath, "utf-8")
      .split("\n")
      .filter((line) => line.trim() !== "");
    const records = parseChatLogLines(lines, agent);
    const summaries = buildSessionHistorySummaries(agent, records);

    return Response.json({ summaries });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

function isAllowedAgent(agent: string): agent is (typeof ALLOWED_AGENTS)[number] {
  return (ALLOWED_AGENTS as readonly string[]).includes(agent);
}
