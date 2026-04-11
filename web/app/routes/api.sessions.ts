import { getProjectRoot } from "@/lib/get-project-root.server";
import { APP_ROOT_EXECUTION_PROJECT_LABEL } from "@/lib/execution-context";
import { readExecutionContextProjectEntries } from "@/lib/execution-context.server";
import { listManagedSessions, readEffectiveSessionExecutionContext } from "@/lib/managed-session.server";
import { getOpencodeClient } from "@/lib/opencode-client";
import {
  listSessionArchiveEntries,
  matchesSessionArchiveView,
  type SessionArchiveView,
} from "@/lib/session-archive.server";
import type { Route } from "./+types/api.sessions";

function formatExecutionSummary(executionProjectLabel: string, contextProjectLabels: string[]): string {
  if (contextProjectLabels.length === 0) {
    return executionProjectLabel;
  }

  if (contextProjectLabels.length === 1) {
    return `${executionProjectLabel} + ${contextProjectLabels[0]}`;
  }

  return `${executionProjectLabel} + ${contextProjectLabels.length} context`;
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  try {
    const url = new URL(request.url);
    const requestedView = url.searchParams.get("view");
    const view: SessionArchiveView =
      requestedView === "archived" || requestedView === "all" || requestedView === "active"
        ? requestedView
        : "active";
    const client = getOpencodeClient();
    const root = getProjectRoot();
    const result = await client.session.list();
    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    const archiveEntries = listSessionArchiveEntries();
    const managedSessions = listManagedSessions();
    const executionProjectLabels = new Map(
      readExecutionContextProjectEntries(root, { includeAppRoot: true }).map((project) => [
        project.id,
        project.displayName,
      ]),
    );
    const sessions = (result.data ?? [])
      .map((session) => {
        const executionContext = readEffectiveSessionExecutionContext(session.id);
        const executionProjectLabel =
          executionProjectLabels.get(executionContext.executionProjectId) ??
          APP_ROOT_EXECUTION_PROJECT_LABEL;
        const contextProjectLabels = executionContext.contextProjectIds.map(
          (projectId) => executionProjectLabels.get(projectId) ?? projectId,
        );
        const managedSession = managedSessions[session.id] ?? null;

        return {
          ...session,
          archivedAt: archiveEntries[session.id]?.archivedAt ?? null,
          executionContext,
          executionSummary: formatExecutionSummary(executionProjectLabel, contextProjectLabels),
          managedSession: managedSession
            ? {
                missionId: managedSession.missionId,
                missionTitle: managedSession.missionTitle,
                ownerAgent: managedSession.ownerAgent,
                ownerLabel: managedSession.ownerLabel,
              }
            : null,
        };
      })
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
