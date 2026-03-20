import type { ActionFunctionArgs } from "react-router";
import { ALLOWED_AGENTS } from "@/constants/agents";
import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  readRuntimeTargetSnapshot,
  sendCrystalPromptToRuntimeTarget,
} from "@/lib/session-binding";

export async function action({ request }: ActionFunctionArgs) {
  let agent = "";
  const root = getProjectRoot();

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = (await request.json()) as {
      agent?: string;
      content?: string;
      fallbackToInbox?: boolean;
      sessionId?: string | null;
      threadId?: string | null;
    };
    agent = body.agent?.trim() ?? "";
    const content = body.content?.trim() ?? "";

    if (!ALLOWED_AGENTS.includes(agent as any)) {
      return Response.json(
        { error: `Invalid agent: ${agent}` },
        { status: 400 }
      );
    }

    if (!content) {
      return Response.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    const result = await sendCrystalPromptToRuntimeTarget(root, agent, content, {
      fallbackToInbox: body.fallbackToInbox !== false,
      sessionId: body.sessionId ?? null,
      threadId: body.threadId ?? null,
    });

    return Response.json({
      ok: true,
      delivery: result.delivery,
      event: result.event,
      messageId: result.messageId,
      promptSessionId: result.promptSessionId,
      runtimeTarget: result.runtimeTarget,
      sessionId: result.sessionId,
      threadId: result.threadId,
    });
  } catch (error) {
    const message = String(error);
    if (message.includes("Explicit runtime session transport is unavailable")) {
      return Response.json(
        {
          error: message,
          runtimeTarget: agent ? readRuntimeTargetSnapshot(root, agent) : null,
        },
        { status: 409 }
      );
    }
    return Response.json(
      {
        error: message,
        runtimeTarget: agent ? readRuntimeTargetSnapshot(root, agent) : null,
      },
      { status: 500 }
    );
  }
}
