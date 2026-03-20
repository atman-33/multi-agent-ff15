import type { Route } from "./+types/api.session.$id.abort";
import { getOpencodeClient } from "@/lib/opencode-client";

export const action = async ({ params }: Route.ActionArgs) => {
  const sessionId = params.id;
  if (!sessionId) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  try {
    const client = getOpencodeClient();
    const result = await client.session.abort({ path: { id: sessionId } });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
