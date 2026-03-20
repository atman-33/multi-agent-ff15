import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import { ALLOWED_AGENTS } from "@/constants/agents";
import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  buildSessionHistorySummaries,
  parseChatLogLines,
} from "@/lib/session-history";
import { readRuntimeTargetSnapshot } from "@/lib/session-binding";
import {
  buildThreadSummaries,
  getThreadActionState,
  readSessionThreadIndex,
  syncAgentThreadState,
  type SessionThreadRecord,
  writeSessionThreadIndex,
} from "@/lib/session-threads";

const CHAT_LOG_PATH = "runtime/logs/agent-chat-monitor.jsonl";

export function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const agent = url.searchParams.get("agent") ?? "";

    if (!isAllowedAgent(agent)) {
      return Response.json(
        { error: `Invalid agent: ${agent}` },
        { status: 400 }
      );
    }

    const root = getProjectRoot();
    const logPath = join(root, CHAT_LOG_PATH);
    const index = readSessionThreadIndex(root);
    const records = existsSync(logPath)
      ? parseChatLogLines(
          readFileSync(logPath, "utf-8")
            .split("\n")
            .filter((line) => line.trim() !== ""),
          agent
        )
      : [];

    const summaries = buildSessionHistorySummaries(agent, records);
    const syncResult = syncAgentThreadState(index, agent, summaries);
    if (syncResult.didChange) {
      writeSessionThreadIndex(root, syncResult.index);
    }

    return Response.json({
      availableActions: buildAvailableActions(
        syncResult.state.selectedThreadId,
        syncResult.state.threads
      ),
      activeRuntimeTarget: readRuntimeTargetSnapshot(root, agent),
      selectedThreadId: syncResult.state.selectedThreadId,
      summaries,
      threads: buildThreadSummaries(syncResult.state.threads),
      threadSummaries: buildThreadSummaries(syncResult.state.threads),
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

function buildAvailableActions(
  selectedThreadId: string | null,
  threads: readonly SessionThreadRecord[]
) {
  const selectedThread =
    selectedThreadId === null
      ? null
      : threads.find((thread) => thread?.threadId === selectedThreadId) ?? null;
  const actionState = getThreadActionState(selectedThread);
  return {
    activate: {
      detail: actionState.activationDetail,
      enabled: actionState.canActivate,
    },
    resume: {
      detail: actionState.resumeDetail,
      enabled: actionState.canResume,
      mode: actionState.resumeMode,
    },
  };
}

function isAllowedAgent(
  agent: string
): agent is (typeof ALLOWED_AGENTS)[number] {
  return (ALLOWED_AGENTS as readonly string[]).includes(agent);
}
