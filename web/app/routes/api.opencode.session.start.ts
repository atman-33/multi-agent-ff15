import type { ActionFunctionArgs } from "react-router";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { isModelSelection, splitModelSelection } from "@/lib/model-variant-selection";
import { getOpencodeClient } from "@/lib/opencode-client";
import { composeGenericSessionPrompt } from "@/lib/prompt-composition-engine";
import type { PromptPart } from "@/lib/prompt-parts";
import { stringifyPromptParts } from "@/lib/prompt-parts";
import type { ModelSelection } from "@/lib/types/mission";

type StartSessionPayload = {
  parts?: unknown;
  model?: ModelSelection;
  agent?: string;
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

  const body = (await request.json().catch(() => null)) as StartSessionPayload | null;
  const parts = Array.isArray(body?.parts) ? body.parts.filter(isPromptPart) : [];

  if (parts.length === 0) {
    return Response.json({ error: "Missing parts" }, { status: 400 });
  }

  try {
    const client = getOpencodeClient();
    const projectRoot = getProjectRoot();
    const title = stringifyPromptParts(parts).slice(0, 80).trim() || "Untitled";
    const selectedModel = isModelSelection(body?.model) ? body.model : undefined;
    const { model, variant } = splitModelSelection(selectedModel);

    const sessionResult = await client.session.create({
      directory: projectRoot,
      title,
    });

    if (sessionResult.error) {
      return Response.json({ error: sessionResult.error }, { status: 502 });
    }

    const sessionId = sessionResult.data?.id;
    if (!sessionId) {
      return Response.json({ error: "Session creation returned no ID" }, { status: 502 });
    }

    const composed = composeGenericSessionPrompt({
      context: {
        missionId: typeof body?.missionId === "string" ? body.missionId : undefined,
        sessionId,
        agent: body?.agent,
        appRoot: projectRoot,
      },
      parts,
    });

    const promptResult = await client.session.promptAsync({
      sessionID: sessionId,
      parts: composed.payloadParts,
      ...(model ? { model } : {}),
      ...(variant ? { variant } : {}),
      ...(body?.agent ? { agent: body.agent } : {}),
    });

    if (promptResult.error) {
      return Response.json({ error: promptResult.error }, { status: 502 });
    }

    return Response.json({ session: sessionResult.data }, { status: 201 });
  } catch {
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};