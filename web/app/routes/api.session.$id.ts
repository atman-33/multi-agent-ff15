import { readEffectiveSessionExecutionContext } from "@/lib/managed-session.server";
import { resolveSessionRouteTarget } from "@/lib/session-owner-routing.server";
import {
  sanitizeSessionMessages,
  type RawSessionMessage,
} from "@/lib/session-history-payload.server";
import { listSessionRequestAnchors } from "@/lib/session-request-anchors.server";
import type { Route } from "./+types/api.session.$id";

function resolveDetailState(request: Request | undefined): "full" | "summary" {
  if (!request) {
    return "full";
  }

  const detailState =
    new URL(request.url).searchParams.get("detailState") ??
    request.headers.get("x-session-detail-state");
  return detailState === "summary" ? "summary" : "full";
}

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const sessionId = params.id;
  if (!sessionId) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  const executionContext = readEffectiveSessionExecutionContext(sessionId);

  try {
    const { client } = resolveSessionRouteTarget(sessionId);
    const result = await client.session.messages({ sessionID: sessionId });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    const anchors = listSessionRequestAnchors(sessionId);
    const messages = sanitizeSessionMessages((result.data ?? []) as RawSessionMessage[], anchors, {
      detailState: resolveDetailState(request),
    });

    return Response.json({ executionContext, messages });
  } catch {
    return Response.json({ executionContext, messages: [] }, { status: 503 });
  }
};
