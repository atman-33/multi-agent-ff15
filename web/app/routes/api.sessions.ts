import { getProjectRoot } from "@/lib/get-project-root.server";
import { getOpencodeClient } from "@/lib/opencode-client";
import {
  listSessionArchiveEntries,
  matchesSessionArchiveView,
  type SessionArchiveView,
} from "@/lib/session-archive.server";
import type { Route } from "./+types/api.sessions";

export const loader = async ({ request }: Route.LoaderArgs) => {
  try {
    const url = new URL(request.url);
    const requestedView = url.searchParams.get("view");
    const view: SessionArchiveView =
      requestedView === "archived" || requestedView === "all" || requestedView === "active"
        ? requestedView
        : "active";
    const client = getOpencodeClient();
    const result = await client.session.list();
    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    const archiveEntries = listSessionArchiveEntries();
    const sessions = (result.data ?? [])
      .map((session) => ({
        ...session,
        archivedAt: archiveEntries[session.id]?.archivedAt ?? null,
      }))
      .filter((session) => matchesSessionArchiveView(session.archivedAt, view));

    return Response.json({ sessions });
  } catch {
    return Response.json({ sessions: [] }, { status: 503 });
  }
};

export const action = async ({ request }: Route.ActionArgs) => {
  try {
    const client = getOpencodeClient();
    const projectRoot = getProjectRoot();
    const body = await request.json().catch(() => ({}));
    const title =
      typeof body?.title === "string" && body.title.trim() ? body.title.trim() : undefined;
    const result = await client.session.create({
      directory: projectRoot,
      ...(title ? { title } : {}),
    });
    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json({ session: result.data });
  } catch {
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
