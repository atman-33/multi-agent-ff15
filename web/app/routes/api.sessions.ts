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
    console.info("[SessionCreate] Creating session", {
      title: title ?? null,
      requestedDirectory: projectRoot,
    });
    const result = await client.session.create({
      query: { directory: projectRoot },
      body: title ? { title } : {},
    });
    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    console.info("[SessionCreate] Session created", {
      id: result.data?.id ?? null,
      directory: result.data?.directory ?? null,
      title: result.data?.title ?? null,
    });

    return Response.json({ session: result.data });
  } catch {
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
