import { spawnSync } from "node:child_process";
import {
  ALLOWED_AGENTS,
  type ModelSwitchAgent,
  AGENT_PANE_INDEX as PANE_INDEX,
} from "@/lib/agents";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { getClientForAgent } from "@/lib/opencode-client.server";

export async function action({ request }: { request: Request }) {
  try {
    const body = (await request.json()) as { agent?: string };
    const agent = body.agent?.trim() ?? "";

    if (!ALLOWED_AGENTS.includes(agent as any)) {
      return Response.json(
        { error: `Invalid agent: ${agent}` },
        { status: 400 }
      );
    }

    const client = getClientForAgent(agent);
    if (!client) {
      return Response.json(
        { error: `No SDK client found for agent: ${agent}` },
        { status: 500 }
      );
    }

    const root = getProjectRoot();
    const timestamp = Date.now();
    const sessionId = `Session ${agent} ${timestamp}`;

    const res = await client.session.create({
      query: { directory: root },
      body: { title: sessionId },
    });

    if (res.error) {
      return Response.json({ error: res.error }, { status: 500 });
    }

    await client.tui.openSessions();

    const pane = PANE_INDEX[agent as ModelSwitchAgent];
    if (pane !== undefined) {
      const target = `ff15:main.${pane}`;
      // wait a bit for UI to appear
      await new Promise((resolve) => setTimeout(resolve, 500));
      spawnSync("tmux", ["send-keys", "-t", target, sessionId], {
        encoding: "utf-8",
        timeout: 2000,
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      spawnSync("tmux", ["send-keys", "-t", target, "Enter"], {
        encoding: "utf-8",
        timeout: 2000,
      });
    }

    // fallback delay for the session list UI animation to complete before it starts loading
    await new Promise((resolve) => setTimeout(resolve, 300));

    return Response.json({ ok: true, session: res.data });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
