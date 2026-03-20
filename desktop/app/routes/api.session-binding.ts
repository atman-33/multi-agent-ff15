import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { ALLOWED_AGENTS } from "@/constants/agents";
import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  ensureRuntimeTargetSelection,
  MissingBoundSessionError,
  getMissingThreadActionDetails,
  persistSelectedThread,
  readRuntimeTargetSnapshot,
  readSessionThreadSelection,
  resolveThreadSessionBinding,
} from "@/lib/session-binding";

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
    const selection = readSessionThreadSelection(root, agent);
    return Response.json({
      activeRuntimeTarget: readRuntimeTargetSnapshot(root, agent),
      selectedThreadId: selection.selectedThreadId,
      thread: selection.thread,
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as {
      action?: "activate" | "resolve" | "select";
      agent?: string;
      autoCreate?: boolean;
      threadId?: string | null;
    };
    const agent = body.agent?.trim() ?? "";

    if (!isAllowedAgent(agent)) {
      return Response.json(
        { error: `Invalid agent: ${agent}` },
        { status: 400 }
      );
    }

    const root = getProjectRoot();

    if (body.action === "select") {
      const selection = persistSelectedThread(
        root,
        agent,
        body.threadId ?? null
      );
      if (body.threadId && !selection.thread) {
        return Response.json(
          { error: `Unknown thread: ${body.threadId}` },
          { status: 404 }
        );
      }
      return Response.json({
        ok: true,
        action: "select",
        activeRuntimeTarget: readRuntimeTargetSnapshot(root, agent),
        selectedThreadId: selection.selectedThreadId,
        thread: selection.thread,
      });
    }

    if (body.action === "activate") {
      const runtimeTarget = await ensureRuntimeTargetSelection(
        root,
        agent,
        body.threadId
      );
      const selection = persistSelectedThread(root, agent, body.threadId);
      return Response.json({
        ok: true,
        action: "activate",
        activeRuntimeTarget: runtimeTarget,
        selectedThreadId: selection.selectedThreadId,
        thread: selection.thread,
      });
    }

    if (!body.threadId) {
      return Response.json(
        { error: "threadId is required for session activation" },
        { status: 400 }
      );
    }

    try {
      const resolution = await resolveThreadSessionBinding(
        root,
        agent,
        body.threadId,
        {
          autoCreate:
            body.action === "activate" ? false : body.autoCreate !== false,
        }
      );
      persistSelectedThread(root, agent, resolution.thread.threadId);
      return Response.json({
        ok: true,
        action: body.action === "activate" ? "activate" : resolution.action,
        activationDetail: resolution.activationDetail,
        activeRuntimeTarget: resolution.runtimeTarget,
        resumeInstruction: resolution.resumeInstruction,
        session: resolution.session,
        status: resolution.status,
        thread: resolution.thread,
        restoredFromSessionId: resolution.previousSessionId,
      });
    } catch (error) {
      if (error instanceof MissingBoundSessionError) {
        const missingDetails = getMissingThreadActionDetails(error.thread);
        return Response.json(
          {
            error: "Bound session is missing",
            action: body.action === "activate" ? "activate" : "resolve",
            activeRuntimeTarget: readRuntimeTargetSnapshot(root, agent),
            activationDetail: missingDetails.activationDetail,
            resumeDetail: missingDetails.resumeDetail,
            resumeMode: missingDetails.resumeMode,
            status: "missing",
            thread: error.thread,
          },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}

function isAllowedAgent(
  agent: string
): agent is (typeof ALLOWED_AGENTS)[number] {
  return (ALLOWED_AGENTS as readonly string[]).includes(agent);
}
