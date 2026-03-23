import { getOpencodeClient } from "@/lib/opencode-client";
import type { Route } from "./+types/api.session.$id.rename";

export const action = async ({ params, request }: Route.ActionArgs) => {
  const sessionId = params.id;
  if (!sessionId) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title.trim() : "";

    if (!title) {
      return Response.json({ error: "Missing title" }, { status: 400 });
    }

    const client = getOpencodeClient();
    const result = await client.session.update({
      path: { id: sessionId },
      body: { title },
    });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json({ session: result.data });
  } catch {
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
