import { getProjectRoot } from "@/lib/get-project-root.server";
import { isModelSelection, splitModelSelection } from "@/lib/model-variant-selection";
import { createOpencodeMessageId } from "@/lib/opencode-message-id";
import { getOpencodeClient } from "@/lib/opencode-client";
import { composeGenericSessionPrompt } from "@/lib/prompt-composition-engine";
import { saveSessionRequestAnchor } from "@/lib/session-request-anchors.server";
import type { SessionSelection } from "@/lib/session-selection-adjustment";
import type { PromptPart } from "@/lib/prompt-parts";
import { appendSessionPromptDebugLog } from "@/lib/session-prompt-debug.server";
import type { ModelSelection } from "@/lib/types/mission";
import type { Route } from "./+types/api.session.$id.prompt";

type PromptPayload = {
  parts: PromptPart[];
  model?: ModelSelection;
  agent?: string;
  missionId?: string;
};

export const action = async ({ request, params }: Route.ActionArgs) => {
  const sessionId = params.id;
  if (!sessionId) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  const requestId = crypto.randomUUID();
  const body = (await request.json().catch(() => null)) as PromptPayload | null;

  appendSessionPromptDebugLog({
    route: "api.session.$id.prompt",
    stage: "request-received",
    requestId,
    sessionId,
    payload: {
      body: body ?? null,
    },
  });

  if (!body?.parts?.length) {
    return Response.json({ error: "Missing parts" }, { status: 400 });
  }

  try {
    const client = getOpencodeClient();
    const selectedModel = isModelSelection(body.model) ? body.model : undefined;
    const { model, variant } = splitModelSelection(selectedModel);
    const userMessageId = createOpencodeMessageId();
    const requestedSelection: SessionSelection = {
      agent: body.agent ? body.agent : null,
      model: selectedModel ?? null,
    };
    const composed = composeGenericSessionPrompt({
      context: {
        missionId: typeof body.missionId === "string" ? body.missionId : undefined,
        sessionId,
        agent: body.agent,
        appRoot: getProjectRoot(),
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
      },
    });

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

    return new Response(null, { status: 204 });
  } catch (error) {
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
