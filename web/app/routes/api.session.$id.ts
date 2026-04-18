import { getOpencodeClient } from "@/lib/opencode-client";
import { readEffectiveSessionExecutionContext } from "@/lib/managed-session.server";
import {
  sanitizeSessionMessages,
  type RawSessionMessage,
} from "@/lib/session-history-payload.server";
import { listSessionRequestAnchors } from "@/lib/session-request-anchors.server";
import type { Route } from "./+types/api.session.$id";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const sessionId = params.id;
  if (!sessionId) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  const executionContext = readEffectiveSessionExecutionContext(sessionId);

  try {
    const client = getOpencodeClient();
    const result = await client.session.messages({ sessionID: sessionId });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    const anchors = listSessionRequestAnchors(sessionId);
    const messages = sanitizeSessionMessages(
      (result.data ?? []) as RawSessionMessage[],
      anchors,
    );

    return Response.json({ executionContext, messages });
  } catch {
    return Response.json({ executionContext, messages: [] }, { status: 503 });
  }
};
