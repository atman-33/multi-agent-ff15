import { getProjectRoot } from "@/lib/get-project-root.server";
import { getOpencodeClient } from "@/lib/opencode-client";
import { buildInjectedPromptContext } from "@/lib/prompt-context.server";
import { buildPromptPayloadParts, type PromptPart } from "@/lib/prompt-parts";
import type { Route } from "./+types/api.session.$id.prompt";

type PromptPayload = {
  parts: PromptPart[];
  model?: {
    providerID: string;
    modelID: string;
  };
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
    const injectedContext = buildInjectedPromptContext({
      missionId: typeof body.missionId === "string" ? body.missionId : undefined,
      sessionId,
      agent: body.agent,
      appRoot: getProjectRoot(),
    });
    const payloadParts = buildPromptPayloadParts(injectedContext, body.parts);

    const result = await client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: payloadParts,
        model: body.model,
        agent: body.agent,
      },
    });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
