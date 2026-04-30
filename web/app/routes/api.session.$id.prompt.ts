import { getProjectRoot } from "@/lib/get-project-root.server";
import { isModelSelection, splitModelSelection } from "@/lib/model-variant-selection";
import { appendMissionActivity } from "@/lib/mission-store";
import { createOpencodeMessageId } from "@/lib/opencode-message-id";
import { queueOwnedSessionTmuxDispatch } from "@/lib/owned-session-transport.server";
import {
  getOwnedSessionTitle,
  hasOwnedSessionTitle,
  saveOwnedSession,
} from "@/lib/owned-session-registry.server";
import { composeGenericSessionPrompt } from "@/lib/prompt-composition-engine";
import {
  MissionTransportNotReadyError,
  requireReadyMissionTransport,
} from "@/lib/primary-agent-mission-transport.server";
import { saveSessionRequestAnchor } from "@/lib/session-request-anchors.server";
import type { SessionSelection } from "@/lib/session-selection-adjustment";
import { resolveSessionRouteTarget } from "@/lib/session-owner-routing.server";
import type { PromptPart } from "@/lib/prompt-parts";
import { stringifyPromptParts } from "@/lib/prompt-parts";
import { appendSessionPromptDebugLog } from "@/lib/session-prompt-debug.server";
import type { ModelSelection } from "@/lib/types/mission";
import type { Route } from "./+types/api.session.$id.prompt";

type PromptPayload = {
  parts: PromptPart[];
  model?: ModelSelection;
  agent?: string;
  missionId?: string;
};

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

async function resolveOwnedSessionActivationTitle(input: {
  client: ReturnType<typeof resolveSessionRouteTarget>["client"];
  sessionId: string;
  ownedSession: NonNullable<ReturnType<typeof resolveSessionRouteTarget>["ownedSession"]>;
  rawSessionTitle: string | null;
}): Promise<string> {
  const canonicalTitle = getOwnedSessionTitle(input.sessionId);
  const storedTitleIsCanonical = hasOwnedSessionTitle(input.sessionId, input.ownedSession.sessionTitle);
  const runtimeTitleIsCanonical =
    input.rawSessionTitle === null || hasOwnedSessionTitle(input.sessionId, input.rawSessionTitle);

  if (storedTitleIsCanonical && runtimeTitleIsCanonical) {
    return canonicalTitle;
  }

  const result = await input.client.session.update({
    sessionID: input.sessionId,
    title: canonicalTitle,
  });

  if (result.error) {
    throw new Error(typeof result.error === "string" ? result.error : "Unable to update owned session title.");
  }

  saveOwnedSession({
    ownerAgent: input.ownedSession.ownerAgent,
    sessionId: input.sessionId,
    sessionTitle: canonicalTitle,
    surface: input.ownedSession.surface,
    transportMode: input.ownedSession.transportMode,
  });

  return canonicalTitle;
}

export const action = async ({ request, params }: Route.ActionArgs) => {
  const sessionId = params.id;
  if (!sessionId) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  const requestId = crypto.randomUUID();
  const body = (await request.json().catch(() => null)) as PromptPayload | null;
  const routeTarget = resolveSessionRouteTarget(sessionId);
  const managedSession = routeTarget.managedSession;
  const ownedSession = routeTarget.ownedSession;

  appendSessionPromptDebugLog({
    route: "api.session.$id.prompt",
    stage: "request-received",
    requestId,
    sessionId,
    payload: {
      body: body ?? null,
      managedSession: managedSession
        ? {
            missionId: managedSession.missionId,
            ownerAgent: managedSession.ownerAgent,
          }
        : null,
      ownedSession: ownedSession
        ? {
            ownerAgent: ownedSession.ownerAgent,
            sessionTitle: ownedSession.sessionTitle,
            surface: ownedSession.surface,
            transportMode: ownedSession.transportMode,
          }
        : null,
    },
  });

  if (!body?.parts?.length) {
    return Response.json({ error: "Missing parts" }, { status: 400 });
  }

  try {
    const appRoot = getProjectRoot();
    const client = routeTarget.client;
    const selectedModel = isModelSelection(body.model) ? body.model : undefined;
    const { model, variant } = splitModelSelection(selectedModel);
    const userMessageId = createOpencodeMessageId();
    const resolvedSessionTitle = await resolveSessionTitle(client, sessionId);
    const rawSessionTitle = managedSession
      ? resolvedSessionTitle
      : resolvedSessionTitle ?? ownedSession?.sessionTitle ?? null;
    const requestedSelection: SessionSelection = {
      agent: body.agent ? body.agent : null,
      model: selectedModel ?? null,
    };
    const managedSessionLog = managedSession
      ? {
          assignedAgent: managedSession.ownerAgent,
          assignedModel: managedSession.assignedModel,
          missionId: managedSession.missionId,
          ownerAgent: managedSession.ownerAgent,
          rawSessionTitle,
          selectedAgent: body.agent ?? null,
          selectedModel: selectedModel ?? null,
        }
      : null;
    const ownedSessionLog = ownedSession
      ? {
          ownerAgent: ownedSession.ownerAgent,
          rawSessionTitle,
          surface: ownedSession.surface,
          transportMode: ownedSession.transportMode,
        }
      : null;
    const composed = composeGenericSessionPrompt({
      context: {
        missionId: managedSession?.missionId ?? (typeof body.missionId === "string" ? body.missionId : undefined),
        sessionId,
        agent: body.agent,
        appRoot,
      },
      parts: body.parts,
    });

    appendSessionPromptDebugLog({
      route: "api.session.$id.prompt",
      stage: "prompt-dispatched",
      requestId,
      sessionId,
      payload: {
        sessionID: sessionId,
        messageID: userMessageId,
        model: model ?? null,
        variant: variant ?? null,
        agent: body.agent ?? null,
        parts: composed.payloadParts,
        managedSession: managedSessionLog,
        ownedSession: ownedSessionLog,
      },
    });

    if (ownedSession?.transportMode === "tmux-resident") {
      await requireReadyMissionTransport({
        appRoot,
        transportMode: ownedSession.transportMode,
      });

      const activationTitle = await resolveOwnedSessionActivationTitle({
        client,
        sessionId,
        ownedSession,
        rawSessionTitle,
      });

      queueOwnedSessionTmuxDispatch({
        ownerAgent: ownedSession.ownerAgent,
        sessionId,
        sessionTitle: activationTitle,
        parts: composed.payloadParts,
        ...(model ? { model } : {}),
        ...(variant ? { variant } : {}),
      });

      appendSessionPromptDebugLog({
        route: "api.session.$id.prompt",
        stage: "prompt-result",
        requestId,
        sessionId,
        payload: {
          error: null,
          managedSession: managedSessionLog,
          ownedSession: ownedSessionLog,
          queued: true,
        },
      });

      try {
        saveSessionRequestAnchor({
          sessionId,
          userMessageId,
          requested: requestedSelection,
        });
      } catch {
        // Request tracking must never block prompt delivery.
      }

      return new Response(null, { status: 204 });
    }

    const result = await client.session.promptAsync({
      sessionID: sessionId,
      messageID: userMessageId,
      parts: composed.payloadParts,
      ...(model ? { model } : {}),
      ...(variant ? { variant } : {}),
      ...(body.agent ? { agent: body.agent } : {}),
    });

    appendSessionPromptDebugLog({
      route: "api.session.$id.prompt",
      stage: result.error ? "prompt-error" : "prompt-result",
      requestId,
      sessionId,
      payload: {
        error: result.error ?? null,
        managedSession: managedSessionLog,
        ownedSession: ownedSessionLog,
      },
    });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    try {
      saveSessionRequestAnchor({
        sessionId,
        userMessageId,
        requested: requestedSelection,
      });
    } catch {
      // Request tracking must never block prompt delivery.
    }

    if (managedSession && managedSession.ownerAgent !== "noctis") {
      const bodyText = stringifyPromptParts(body.parts);
      if (bodyText) {
        appendMissionActivity(managedSession.missionId, {
          id: `activity_${userMessageId}`,
          actor: "user",
          speaker: "user",
          kind: "user_message",
          body: bodyText,
          createdAt: new Date().toISOString(),
          source: {
            type: "session_message",
            sessionId,
            messageId: userMessageId,
          },
        });
      }
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof MissionTransportNotReadyError) {
      return Response.json({ error: error.message }, { status: 503 });
    }

    appendSessionPromptDebugLog({
      route: "api.session.$id.prompt",
      stage: "prompt-error",
      requestId,
      sessionId,
      payload: {
        error,
      },
    });
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
