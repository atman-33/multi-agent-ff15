import { getOpencodeClient } from "@/lib/opencode-client";
import type { Route } from "./+types/api.session.$id";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const sessionId = params.id;
  if (!sessionId) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  try {
    const client = getOpencodeClient();
    const result = await client.session.messages({ sessionID: sessionId });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json({ messages: result.data ?? [] });
  } catch {
    return Response.json({ messages: [] }, { status: 503 });
  }
};
