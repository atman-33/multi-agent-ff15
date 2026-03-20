import fs from "node:fs";
import { join } from "node:path";
import {
  AGENT_PANE_INDEX,
  ALLOWED_AGENTS,
  type ModelSwitchAgent,
} from "@/constants/agents";
import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  createAndBindThreadSession,
  getMissingThreadActionDetails,
  persistSelectedThread,
  readRuntimeTargetSnapshot,
  resolveThreadSessionBinding,
} from "@/lib/session-binding";

export async function action({ request }: { request: Request }) {
  try {
    const body = (await request.json()) as {
      agent?: string;
      mode?: "create" | "resolve" | "resume";
      threadId?: string | null;
    };
    const agent = body.agent?.trim() ?? "";

    if (!ALLOWED_AGENTS.includes(agent as any)) {
      return Response.json(
        { error: `Invalid agent: ${agent}` },
        { status: 400 }
      );
    }

    const root = getProjectRoot();
    const mode = body.mode ?? (body.threadId ? "resolve" : "create");

    if (mode === "resolve") {
      if (!body.threadId) {
        return Response.json(
          { error: "threadId is required when resolving a thread binding" },
          { status: 400 }
        );
      }

      try {
        const resolution = await resolveThreadSessionBinding(
          root,
          agent,
          body.threadId
        );
        persistSelectedThread(root, agent, resolution.thread.threadId);
        return Response.json({
          ok: true,
          action: resolution.action,
          activeRuntimeTarget: resolution.runtimeTarget,
          activationDetail: resolution.activationDetail,
          resumeInstruction: resolution.resumeInstruction,
          mode,
          session: resolution.session,
          status: resolution.status,
          thread: resolution.thread,
          restoredFromSessionId: resolution.previousSessionId,
        });
      } catch (error) {
        if ((error as Error).name === "MissingBoundSessionError") {
          const missing = error as InstanceType<
            typeof import("@/lib/session-binding").MissingBoundSessionError
          >;
          const missingDetails = getMissingThreadActionDetails(missing.thread);
          return Response.json(
            {
              error: "Bound session is missing",
              action: "resolve",
              activeRuntimeTarget: readRuntimeTargetSnapshot(root, agent),
              activationDetail: missingDetails.activationDetail,
              resumeDetail: missingDetails.resumeDetail,
              resumeMode: missingDetails.resumeMode,
              status: "missing",
              thread: missing.thread,
            },
            { status: 409 }
          );
        }
        throw error;
      }
    }

    const created = await createAndBindThreadSession(root, agent, {
      mode: mode === "resume" ? "resume" : "create",
      preferredThreadId: body.threadId ?? null,
    });
    persistSelectedThread(root, agent, created.thread.threadId);
    appendSessionStatusRecord(root, agent, {
      event: mode === "resume" ? "session_resume_started" : "new_session",
      message:
        mode === "resume"
          ? "Guided resume session started."
          : "New session started.",
      sessionId: created.session.id,
    });

    return Response.json({
      ok: true,
      action: created.action,
      activeRuntimeTarget: created.runtimeTarget,
      activationDetail: created.activationDetail,
      mode,
      resumeInstruction: created.resumeInstruction,
      session: created.session,
      status: created.status,
      thread: created.thread,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

function appendSessionStatusRecord(
  root: string,
  agent: string,
  payload: {
    event: string;
    message: string;
    sessionId: string;
  }
) {
  try {
    const logPath = join(root, "runtime/logs/agent-chat-monitor.jsonl");
    const pane = AGENT_PANE_INDEX[agent as ModelSwitchAgent];
    const record = {
      agent,
      content: payload.message,
      id: `${payload.event}-${Date.now()}`,
      kind: "status",
      meta: {
        pane: pane !== undefined ? String(pane) : "0",
        event: payload.event,
      },
      session_id: payload.sessionId,
      source: "system",
      ts: new Date().toISOString(),
    };
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf-8");
  } catch (error) {
    console.error("[SessionCreate] Failed to append status record:", error);
  }
}
