import { archiveSession, restoreSession } from "@/lib/session-archive.server";
import type { Route } from "./+types/api.session.$id.archive";

export const action = async ({ params, request }: Route.ActionArgs) => {
  const sessionId = params.id;
  if (!sessionId) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const archiveAction = body?.action;
  if (archiveAction !== "archive" && archiveAction !== "restore") {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }

  const entry = archiveAction === "archive" ? archiveSession(sessionId) : restoreSession(sessionId);

  return Response.json({
    session: {
      id: sessionId,
      archivedAt: entry.archivedAt,
    },
  });
};