import { appendMissionActivity, getMission } from "@/lib/mission-store";
import { cancelTmuxDispatchItemsForSession } from "@/lib/mission-primary-agent-outbox.server";
import {
  cancelOwnedSessionTmuxDispatchItems,
  getOwnedSessionTransportMissionId,
} from "@/lib/owned-session-transport.server";
import { appendSessionPromptDebugLog } from "@/lib/session-prompt-debug.server";
import { resolveSessionRouteTarget } from "@/lib/session-owner-routing.server";
import {
  interruptManagedTmuxSession,
  requestTmuxDispatchAbortForSession,
} from "@/lib/tmux-transport-abort.server";
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
  let ownedSession: ReturnType<typeof resolveSessionRouteTarget>["ownedSession"] = null;

  try {
    const {
      client,
      managedSession: resolvedManagedSession,
      ownedSession: resolvedOwnedSession,
    } = resolveSessionRouteTarget(sessionId);
    managedSession = resolvedManagedSession;
    ownedSession = resolvedOwnedSession;
    const managedMission = managedSession ? getMission(managedSession.missionId) : null;
    const isTmuxManagedSession = managedMission?.transportMode === "tmux-resident";
    const rawSessionTitle = managedSession
      ? await resolveSessionTitle(client, sessionId)
      : ownedSession?.sessionTitle ?? null;
    const abortedAt = new Date().toISOString();
    let tmuxAbortAction:
      | {
          error?: string | null;
          mode: "dispatcher-cancel" | "escape" | "error";
          phase?: string | null;
        }
      | null = null;

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
        ownedSession: ownedSession
          ? {
              ownerAgent: ownedSession.ownerAgent,
              rawSessionTitle,
              surface: ownedSession.surface,
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

      if (isTmuxManagedSession) {
        try {
          const dispatchAbort = requestTmuxDispatchAbortForSession({
            missionId: managedSession.missionId,
            requestedAt: abortedAt,
            requestedBy: "abort-route",
            sessionId,
          });

          if (dispatchAbort.requested) {
            tmuxAbortAction = {
              mode: "dispatcher-cancel",
              phase: dispatchAbort.currentDispatch?.phase ?? null,
            };
          } else {
            interruptManagedTmuxSession({
              method: "escape",
              ownerAgent: managedSession.ownerAgent,
            });
            tmuxAbortAction = {
              mode: "escape",
              phase: dispatchAbort.currentDispatch?.phase ?? null,
            };
          }
        } catch (tmuxInterruptError) {
          tmuxAbortAction = {
            error:
              tmuxInterruptError instanceof Error
                ? tmuxInterruptError.message
                : String(tmuxInterruptError),
            mode: "error",
          };
        }
      }
    }

    if (ownedSession) {
      cancelOwnedSessionTmuxDispatchItems({
        sessionId,
        cancelledAt: abortedAt,
        cancelledBy: "abort-route",
        reason: "Owned session abort requested",
      });

      if (ownedSession.transportMode === "tmux-resident") {
        try {
          const dispatchAbort = requestTmuxDispatchAbortForSession({
            missionId: getOwnedSessionTransportMissionId(sessionId),
            requestedAt: abortedAt,
            requestedBy: "abort-route",
            sessionId,
          });

          if (dispatchAbort.requested) {
            tmuxAbortAction = {
              mode: "dispatcher-cancel",
              phase: dispatchAbort.currentDispatch?.phase ?? null,
            };
          } else {
            interruptManagedTmuxSession({
              method: "escape",
              ownerAgent: ownedSession.ownerAgent,
            });
            tmuxAbortAction = {
              mode: "escape",
              phase: dispatchAbort.currentDispatch?.phase ?? null,
            };
          }
        } catch (tmuxInterruptError) {
          tmuxAbortAction = {
            error:
              tmuxInterruptError instanceof Error
                ? tmuxInterruptError.message
                : String(tmuxInterruptError),
            mode: "error",
          };
        }
      }
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
        ownedSession: ownedSession
          ? {
              ownerAgent: ownedSession.ownerAgent,
              rawSessionTitle,
              surface: ownedSession.surface,
            }
          : null,
        tmuxAbortAction,
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
        ownedSession: ownedSession
          ? {
              ownerAgent: ownedSession.ownerAgent,
              surface: ownedSession.surface,
            }
          : null,
      },
    });
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
