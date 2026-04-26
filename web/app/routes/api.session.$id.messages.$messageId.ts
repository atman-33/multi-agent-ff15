import { getOpencodeClient } from "@/lib/opencode-client";
import {
  sanitizeSessionMessage,
  type RawSessionMessage,
} from "@/lib/session-history-payload.server";
import { listSessionRequestAnchors } from "@/lib/session-request-anchors.server";
import type { Route } from "./+types/api.session.$id.messages.$messageId";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const sessionId = params.id;
  const messageId = params.messageId;
  if (!sessionId || !messageId) {
    return Response.json({ error: "Missing session id or message id" }, { status: 400 });
  }

  try {
    const client = getOpencodeClient();
    const result = await client.session.messages({ sessionID: sessionId });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    const rawMessage = ((result.data ?? []) as RawSessionMessage[]).find(
      (message) => message.info.id === messageId,
    );

    if (!rawMessage) {
      return Response.json({ error: "Message not found" }, { status: 404 });
    }

    const anchors = listSessionRequestAnchors(sessionId);
    const message = sanitizeSessionMessage(rawMessage, anchors, { detailState: "full" });

    return Response.json({ message });
  } catch {
    return Response.json({ error: "Unable to load session message detail" }, { status: 503 });
  }
};