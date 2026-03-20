import fs from "node:fs";
import { join } from "node:path";
import type { ActionFunctionArgs } from "react-router";
import { AGENT_PANE_INDEX, type ModelSwitchAgent } from "@/constants/agents";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { getClientForAgent } from "@/lib/opencode-client.server";
import { resolveAbortTarget } from "@/lib/session-binding";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const agent = String(formData.get("agent") ?? "").trim();
    const requestedSessionID =
      String(formData.get("sessionID") ?? "").trim() || null;
    const threadId = String(formData.get("threadId") ?? "").trim() || null;

    if (!agent) {
      return Response.json({ error: "Agent is required" }, { status: 400 });
    }

    const client = getClientForAgent(agent as any);
    if (!client) {
      return Response.json(
        { error: `Could not initialize client for ${agent}` },
        { status: 500 }
      );
    }

    const root = getProjectRoot();
    const resolution = await resolveAbortTarget(
      root,
      agent,
      requestedSessionID,
      threadId
    );

    if (!resolution.sessionID) {
      return Response.json(
        {
          error: "No bound session found to abort",
          status: resolution.thread?.binding.status ?? "missing",
          thread: resolution.thread,
        },
        { status: 404 }
      );
    }

    const abortResponse = await client.session.abort({
      directory: root,
      sessionID: resolution.sessionID,
    });
    if (abortResponse.error) {
      return Response.json({ error: abortResponse.error }, { status: 500 });
    }

    appendAbortRecord(root, agent, resolution.sessionID);

    return Response.json({
      success: true,
      agent,
      sessionID: resolution.sessionID,
      thread: resolution.thread,
    });
  } catch (e) {
    console.error("[Abort] Error:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

function appendAbortRecord(root: string, agent: string, sessionID: string) {
  try {
    const logPath = join(root, "runtime/logs/agent-chat-monitor.jsonl");
    const pane = AGENT_PANE_INDEX[agent as ModelSwitchAgent];
    const abortRecord = {
      agent,
      content: "Session aborted.",
      id: `abort-${Date.now()}`,
      kind: "status",
      meta: {
        pane: pane !== undefined ? String(pane) : "0",
        event: "abort",
      },
      session_id: sessionID,
      source: "system",
      ts: new Date().toISOString(),
    };
    fs.appendFileSync(logPath, `${JSON.stringify(abortRecord)}\n`, "utf-8");
  } catch (logError) {
    console.error("[Abort] Failed to append abort status record:", logError);
  }
}
