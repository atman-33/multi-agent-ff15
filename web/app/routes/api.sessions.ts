import type { Route } from "./+types/api.sessions";
import { getOpencodeClient } from "@/lib/opencode-client";
import { getProjectRoot } from "@/lib/get-project-root.server";

export const loader = async () => {
  try {
    const client = getOpencodeClient();
    const result = await client.session.list();
    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }
    return Response.json({ sessions: result.data ?? [] });
  } catch {
    return Response.json({ sessions: [] }, { status: 503 });
  }
};

export const action = async ({ request }: Route.ActionArgs) => {
  try {
    const client = getOpencodeClient();
    const projectRoot = getProjectRoot();
    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : undefined;
    const result = await client.session.create({
      query: { directory: projectRoot },
      body: title ? { title } : {},
    });
    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json({ session: result.data });
  } catch {
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
