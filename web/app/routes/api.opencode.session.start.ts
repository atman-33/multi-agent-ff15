import type { ActionFunctionArgs } from "react-router";
import { APP_ROOT_EXECUTION_PROJECT_ID } from "@/lib/execution-context";
import { readExecutionContextProjectDefinition } from "@/lib/execution-context.server";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { isModelSelection, splitModelSelection } from "@/lib/model-variant-selection";
import { createOpencodeMessageId } from "@/lib/opencode-message-id";
import { getOpencodeClient } from "@/lib/opencode-client";
import { composeGenericSessionPrompt } from "@/lib/prompt-composition-engine";
import type { PromptPart } from "@/lib/prompt-parts";
import { stringifyPromptParts } from "@/lib/prompt-parts";
import { saveSessionExecutionContext } from "@/lib/session-execution-context.server";
import { saveSessionRequestAnchor } from "@/lib/session-request-anchors.server";
import type { SessionSelection } from "@/lib/session-selection-adjustment";
import { appendSessionPromptDebugLog } from "@/lib/session-prompt-debug.server";
import type { ModelSelection } from "@/lib/types/mission";

type StartSessionPayload = {
  parts?: unknown;
  model?: ModelSelection;
  agent?: string;
  contextProjectIds?: unknown;
  executionProjectId?: unknown;
  missionId?: string;
};

function isPromptPart(value: unknown): value is PromptPart {
  if (!value || typeof value !== "object") {
    return false;
  }

  const part = value as Record<string, unknown>;

  if (part.type === "text") {
    return typeof part.text === "string";
  }

  if (part.type === "file") {
    return (
      typeof part.path === "string" &&
      (part.content === undefined || typeof part.content === "string")
    );
  }

  return false;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const requestId = crypto.randomUUID();
  const body = (await request.json().catch(() => null)) as StartSessionPayload | null;
  const parts = Array.isArray(body?.parts) ? body.parts.filter(isPromptPart) : [];

  appendSessionPromptDebugLog({
    route: "api.opencode.session.start",
    stage: "request-received",
    requestId,
    payload: {
      body: body ?? null,
      filteredParts: parts,
    },
  });

  if (parts.length === 0) {
    return Response.json({ error: "Missing parts" }, { status: 400 });
  }

  try {
    const client = getOpencodeClient();
    const projectRoot = getProjectRoot();
    const executionProjectId =
      typeof body?.executionProjectId === "string" && body.executionProjectId.trim().length > 0
        ? body.executionProjectId.trim()
        : APP_ROOT_EXECUTION_PROJECT_ID;
    const executionProject = readExecutionContextProjectDefinition(projectRoot, executionProjectId, {
      includeAppRoot: true,
    });

    if (!executionProject) {
      return Response.json({ error: "Unknown executionProjectId" }, { status: 400 });
    }

    const title = stringifyPromptParts(parts).slice(0, 80).trim() || "Untitled";
    const selectedModel = isModelSelection(body?.model) ? body.model : undefined;
    const { model, variant } = splitModelSelection(selectedModel);
    const userMessageId = createOpencodeMessageId();
    const requestedSelection: SessionSelection = {
      agent: body?.agent ? body.agent : null,
      model: selectedModel ?? null,
    };

    const sessionResult = await client.session.create({
      directory: executionProject.rootPath,
      title,
    });

    if (sessionResult.error) {
      return Response.json({ error: sessionResult.error }, { status: 502 });
    }

    const sessionId = sessionResult.data?.id;
    if (!sessionId) {
      return Response.json({ error: "Session creation returned no ID" }, { status: 502 });
    }

    saveSessionExecutionContext(sessionId, {
      executionProjectId,
      contextProjectIds: body?.contextProjectIds,
    });

    const composed = composeGenericSessionPrompt({
      context: {
        missionId: typeof body?.missionId === "string" ? body.missionId : undefined,
        sessionId,
        agent: body?.agent,
        appRoot: projectRoot,
      },
      parts,
    });

    appendSessionPromptDebugLog({
      route: "api.opencode.session.start",
      stage: "prompt-dispatched",
      requestId,
      sessionId,
      payload: {
        sessionID: sessionId,
        messageID: userMessageId,
        model: model ?? null,
        variant: variant ?? null,
        agent: body?.agent ?? null,
        parts: composed.payloadParts,
      },
    });

    const promptResult = await client.session.promptAsync({
      sessionID: sessionId,
      messageID: userMessageId,
      parts: composed.payloadParts,
      ...(model ? { model } : {}),
      ...(variant ? { variant } : {}),
      ...(body?.agent ? { agent: body.agent } : {}),
    });

    appendSessionPromptDebugLog({
      route: "api.opencode.session.start",
      stage: promptResult.error ? "prompt-error" : "prompt-result",
      requestId,
      sessionId,
      payload: {
        error: promptResult.error ?? null,
      },
    });

    if (promptResult.error) {
      return Response.json({ error: promptResult.error }, { status: 502 });
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

    return Response.json({ session: sessionResult.data }, { status: 201 });
  } catch (error) {
    appendSessionPromptDebugLog({
      route: "api.opencode.session.start",
      stage: "prompt-error",
      requestId,
      payload: {
        error,
      },
    });
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};