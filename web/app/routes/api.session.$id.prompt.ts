import { getProjectRoot } from "@/lib/get-project-root.server";
import { isModelSelection, splitModelSelection } from "@/lib/model-variant-selection";
import { getOpencodeClient } from "@/lib/opencode-client";
import { composeGenericSessionPrompt } from "@/lib/prompt-composition-engine";
import type { PromptPart } from "@/lib/prompt-parts";
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

  const body = (await request.json().catch(() => null)) as PromptPayload | null;
  if (!body?.parts?.length) {
    return Response.json({ error: "Missing parts" }, { status: 400 });
  }

  try {
    const client = getOpencodeClient();
    const selectedModel = isModelSelection(body.model) ? body.model : undefined;
    const { model, variant } = splitModelSelection(selectedModel);
    const composed = composeGenericSessionPrompt({
      context: {
        missionId: typeof body.missionId === "string" ? body.missionId : undefined,
        sessionId,
        agent: body.agent,
        appRoot: getProjectRoot(),
      },
      parts: body.parts,
    });

    const result = await client.session.promptAsync({
      sessionID: sessionId,
      parts: composed.payloadParts,
      ...(model ? { model } : {}),
      ...(variant ? { variant } : {}),
      ...(body.agent ? { agent: body.agent } : {}),
    });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
