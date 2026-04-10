import { getProjectRoot } from "@/lib/get-project-root.server";
import { provisionMissionExecutionWorkspace } from "@/lib/mission-execution-workspace.server";
import { readRegisteredProjectDefinition } from "@/lib/project-config.server";
import {
  appendMissionActivity,
  clearMissionSessions,
  getMission,
  updateMissionExecutionContext,
} from "@/lib/mission-store";
import type { Route } from "./+types/api.noctis.missions.$missionId.context";

export const action = async ({ params, request }: Route.ActionArgs) => {
  if (request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    executionProjectId?: unknown;
    contextProjectIds?: unknown;
  } | null;
  if (!body) {
    return Response.json({ error: "Missing request body" }, { status: 400 });
  }

  const executionProjectId =
    typeof body.executionProjectId === "string" && body.executionProjectId.trim().length > 0
      ? body.executionProjectId.trim()
      : undefined;
  const contextProjectIds = Array.isArray(body.contextProjectIds)
    ? body.contextProjectIds.filter((projectId): projectId is string => typeof projectId === "string")
    : undefined;
  const appRoot = getProjectRoot();
  const registeredContextProjectIds = contextProjectIds?.filter(
    (projectId) => !!readRegisteredProjectDefinition(appRoot, projectId),
  );

  if (!executionProjectId && contextProjectIds === undefined) {
    return Response.json({ error: "No mission context changes provided" }, { status: 400 });
  }

  try {
    if (mission.executionProjectId && executionProjectId && mission.executionProjectId !== executionProjectId) {
      return Response.json(
        { error: "Execution project cannot be changed after mission creation." },
        { status: 409 },
      );
    }

    if (!mission.executionProjectId && executionProjectId) {
      const executionWorkspace = provisionMissionExecutionWorkspace({
        appRoot,
        createdAt: mission.createdAt,
        executionProjectId,
        title: mission.title,
      });

      clearMissionSessions(missionId);
      updateMissionExecutionContext(missionId, {
        executionProjectId,
        contextProjectIds: registeredContextProjectIds,
        baseBranch: executionWorkspace.baseBranch,
        branch: executionWorkspace.branch,
        workspacePath: executionWorkspace.workspacePath,
        workspaceStatus: executionWorkspace.workspaceStatus,
      });
      appendMissionActivity(missionId, {
        id: `activity_${crypto.randomUUID()}`,
        actor: "system",
        speaker: "system",
        kind: "system_event",
        body: `Assigned execution project ${executionProjectId}.`,
        createdAt: new Date().toISOString(),
      });

      return Response.json({ missionId });
    }

    updateMissionExecutionContext(missionId, {
      ...(registeredContextProjectIds !== undefined ? { contextProjectIds: registeredContextProjectIds } : {}),
    });
    appendMissionActivity(missionId, {
      id: `activity_${crypto.randomUUID()}`,
      actor: "system",
      speaker: "system",
      kind: "system_event",
      body: "Updated mission context projects.",
      createdAt: new Date().toISOString(),
    });

    return Response.json({ missionId });
  } catch (error) {
    if (error instanceof Error && error.message.length > 0) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    return Response.json({ error: "Unable to update mission context." }, { status: 500 });
  }
};