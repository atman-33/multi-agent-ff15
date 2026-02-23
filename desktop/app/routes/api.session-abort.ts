import fs from "node:fs";
import { join } from "node:path";
import type { ActionFunctionArgs } from "react-router";
import { AGENT_PANE_INDEX, type ModelSwitchAgent } from "@/lib/agents";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { getClientForAgent } from "@/lib/opencode-client.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const agent = formData.get("agent") as string;
    let sessionID = formData.get("sessionID") as string | null;

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

    // 1. If sessionID is missing, try to find the "busy" session for this agent
    if (!sessionID) {
      try {
        const { data: statuses } = await client.session.status();

        if (statuses) {
          const activeSessionEntry = Object.entries(statuses).find(
            ([_, status]) => (status as any).type === "busy"
          );

          if (activeSessionEntry) {
            sessionID = activeSessionEntry[0];
            console.log(
              `[Abort] Found active session for ${agent}: ${sessionID}`
            );
          }
        }

        if (!sessionID) {
          // 2. Last resort: Get the most recent session
          const { data: sessions } = await client.session.list({ limit: 1 });
          if (sessions && (sessions as any).length > 0) {
            sessionID = (sessions as any)[0].id;
            console.log(
              `[Abort] No busy session found for ${agent}, using most recent: ${sessionID}`
            );
          }
        }
      } catch (e) {
        console.error(`[Abort] Failed to list sessions for ${agent}:`, e);
      }
    }

    if (!sessionID) {
      return Response.json(
        { error: "No active session found to abort" },
        { status: 404 }
      );
    }

    await client.session.abort({ sessionID });

    // 3. Append a status record to the chat log to clear the "busy" state in the UI
    try {
      const root = getProjectRoot();
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
      console.log(`[Abort] Appended abort status record for ${agent}`);
    } catch (logError) {
      console.error("[Abort] Failed to append abort status record:", logError);
    }

    return Response.json({ success: true, agent, sessionID });
  } catch (e) {
    console.error("[Abort] Error:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
