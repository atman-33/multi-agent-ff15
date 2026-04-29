import { appendMissionActivity } from "@/lib/mission-store";
import { cancelTmuxDispatchItemsForSession } from "@/lib/mission-primary-agent-outbox.server";
import { appendSessionPromptDebugLog } from "@/lib/session-prompt-debug.server";
import { resolveSessionRouteTarget } from "@/lib/session-owner-routing.server";
import type { Route } from "./+types/api.session.$id.abort";

async function resolveSessionTitle(
  client: ReturnType<typeof resolveSessionRouteTarget>["client"],
  sessionId: string,
): Promise<string | null> {
  try {
    const result = await client.session.list();
    if (result.error) {
      return null;
    }

    return result.data?.find((session) => session.id === sessionId)?.title ?? null;
  } catch {
    return null;
  }
}

export const action = async ({ params }: Route.ActionArgs) => {
  const sessionId = params.id;
  if (!sessionId) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  const requestId = crypto.randomUUID();
  let managedSession: ReturnType<typeof resolveSessionRouteTarget>["managedSession"] = null;

  try {
    const { client, managedSession: resolvedManagedSession } = resolveSessionRouteTarget(sessionId);
    managedSession = resolvedManagedSession;
    const rawSessionTitle = managedSession ? await resolveSessionTitle(client, sessionId) : null;
    const abortedAt = new Date().toISOString();

    appendSessionPromptDebugLog({
      route: "api.session.$id.abort",
      stage: "abort-requested",
      requestId,
      sessionId,
      payload: {
        managedSession: managedSession
          ? {
              missionId: managedSession.missionId,
              ownerAgent: managedSession.ownerAgent,
              rawSessionTitle,
            }
          : null,
      },
    });

    if (managedSession) {
      cancelTmuxDispatchItemsForSession({
        missionId: managedSession.missionId,
        sessionId,
        cancelledAt: abortedAt,
        cancelledBy: "abort-route",
        reason: "Managed session abort requested",
      });
    }

    const result = await client.session.abort({ sessionID: sessionId });

    appendSessionPromptDebugLog({
      route: "api.session.$id.abort",
      stage: result.error ? "abort-error" : "abort-result",
      requestId,
      sessionId,
      payload: {
        error: result.error ?? null,
        managedSession: managedSession
          ? {
              missionId: managedSession.missionId,
              ownerAgent: managedSession.ownerAgent,
              rawSessionTitle,
            }
          : null,
      },
    });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    if (managedSession) {
      appendMissionActivity(managedSession.missionId, {
        id: `activity_${crypto.randomUUID()}`,
        actor: "system",
        speaker: "system",
        kind: "system_event",
        body: `OpenCode manually aborted the managed ${managedSession.ownerLabel} session.`,
        createdAt: abortedAt,
        source: {
          type: "system",
          sessionId,
        },
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    appendSessionPromptDebugLog({
      route: "api.session.$id.abort",
      stage: "abort-error",
      requestId,
      sessionId,
      payload: {
        error,
        managedSession: managedSession
          ? {
              missionId: managedSession.missionId,
              ownerAgent: managedSession.ownerAgent,
            }
          : null,
      },
    });
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
