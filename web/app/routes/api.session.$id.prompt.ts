import { getOpencodeClient } from "@/lib/opencode-client";
import type { Route } from "./+types/api.session.$id.prompt";

type PromptPayload = {
  parts: Array<{ type: "text"; text: string } | { type: "file"; path: string; content?: string }>;
  model?: {
    providerID: string;
    modelID: string;
  };
  agent?: string;
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
    const payloadParts = body.parts.flatMap((part) => {
      if (part.type === "text") {
        return [{ type: "text" as const, text: part.text }];
      }
      return [
        { type: "text" as const, text: `@${part.path}` },
        { type: "text" as const, text: part.content ? `\n${part.content}` : "" },
      ].filter((item) => item.text.length > 0);
    });

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
