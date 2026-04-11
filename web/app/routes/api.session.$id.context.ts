import { findManagedSession } from "@/lib/managed-session.server";
import { readSessionExecutionContext, saveSessionExecutionContext } from "@/lib/session-execution-context.server";
import type { Route } from "./+types/api.session.$id.context";

export const action = async ({ params, request }: Route.ActionArgs) => {
  if (request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const sessionId = params.id;
  if (!sessionId) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    contextProjectIds?: unknown;
    executionProjectId?: unknown;
  } | null;
  if (!body) {
    return Response.json({ error: "Missing request body" }, { status: 400 });
  }

  if (findManagedSession(sessionId)) {
    return Response.json(
      { error: "Mission-managed sessions use mission-owned context." },
      { status: 409 },
    );
  }

  const currentExecutionContext = readSessionExecutionContext(sessionId);
  const requestedExecutionProjectId =
    typeof body.executionProjectId === "string" && body.executionProjectId.trim().length > 0
      ? body.executionProjectId.trim()
      : undefined;

  if (
    requestedExecutionProjectId &&
    requestedExecutionProjectId !== currentExecutionContext.executionProjectId
  ) {
    return Response.json(
      { error: "Execution project cannot be changed after session creation." },
      { status: 409 },
    );
  }

  if (!Array.isArray(body.contextProjectIds) && requestedExecutionProjectId === undefined) {
    return Response.json({ error: "No session context changes provided" }, { status: 400 });
  }

  const executionContext = saveSessionExecutionContext(sessionId, {
    executionProjectId: currentExecutionContext.executionProjectId,
    contextProjectIds:
      Array.isArray(body.contextProjectIds) ? body.contextProjectIds : currentExecutionContext.contextProjectIds,
  });

  return Response.json({ sessionId, executionContext });
};