import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  deleteMissionExecutionWorkspace,
  provisionMissionExecutionWorkspace,
} from "@/lib/mission-execution-workspace.server";
import { saveOperationState } from "@/lib/operation-runtime/state";
import { getOpencodeClient } from "@/lib/opencode-client";
import { readRegisteredProjectDefinition } from "@/lib/project-config.server";
import type { MissionSurfaceId, MissionSummary } from "@/lib/types/mission";
import {
  appendMissionActivity,
  archiveMission,
  clearMissionSessions,
  getMission,
  getMissionPrimarySessionId,
  getMissionSurfaceId,
  restoreMission,
  updateMissionExecutionContext,
  updateMissionMetadata,
} from "./mission-store";

function buildMissionSummaryPayload(input: {
  missionId: string;
  title: string;
  objective?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  status: MissionSummary["status"];
}) {
  return {
    missionId: input.missionId,
    title: input.title,
    objective: input.objective,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    archivedAt: input.archivedAt ?? null,
    status: input.status,
  };
}

function resolveSurfaceMission(missionId: string, surfaceId: MissionSurfaceId) {
  const mission = getMission(missionId);
  if (!mission || getMissionSurfaceId(mission) !== surfaceId) {
    return null;
  }

  return mission;
}

export async function handleMissionArchiveAction(input: {
  missionId?: string;
  request: Request;
  surfaceId: MissionSurfaceId;
}) {
  const missionId = input.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = resolveSurfaceMission(missionId, input.surfaceId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  const body = await input.request.json().catch(() => ({}));
  const archiveAction = body?.action;
  if (archiveAction !== "archive" && archiveAction !== "restore") {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }

  const updatedMission =
    archiveAction === "archive" ? archiveMission(missionId) : restoreMission(missionId);

  if (!updatedMission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  return Response.json({
    mission: buildMissionSummaryPayload({
      missionId: updatedMission.id,
      title: updatedMission.title,
      objective: updatedMission.objective,
      createdAt: updatedMission.createdAt,
      updatedAt: updatedMission.updatedAt,
      archivedAt: updatedMission.archivedAt ?? null,
      status: updatedMission.status,
    }),
  });
}

export async function handleMissionRenameAction(input: {
  missionId?: string;
  request: Request;
  surfaceId: MissionSurfaceId;
}) {
  const missionId = input.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = resolveSurfaceMission(missionId, input.surfaceId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  const body = await input.request.json().catch(() => ({}));
  const title = typeof body?.title === "string" ? body.title.trim() : "";

  if (!title) {
    return Response.json({ error: "Missing title" }, { status: 400 });
  }

  updateMissionMetadata(missionId, { title });

  const updatedMission = getMission(missionId);
  if (!updatedMission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  return Response.json({
    mission: buildMissionSummaryPayload({
      missionId: updatedMission.id,
      title: updatedMission.title,
      objective: updatedMission.objective,
      createdAt: updatedMission.createdAt,
      updatedAt: updatedMission.updatedAt,
      status: updatedMission.status,
    }),
  });
}

export async function handleMissionContextAction(input: {
  missionId?: string;
  request: Request;
  surfaceId: MissionSurfaceId;
}) {
  if (input.request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const missionId = input.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = resolveSurfaceMission(missionId, input.surfaceId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  const body = (await input.request.json().catch(() => null)) as {
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
    ? body.contextProjectIds.filter(
        (projectId): projectId is string => typeof projectId === "string",
      )
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
      ...(registeredContextProjectIds !== undefined
        ? { contextProjectIds: registeredContextProjectIds }
        : {}),
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
}

export async function handleMissionWorkspaceDeleteAction(input: {
  missionId?: string;
  request: Request;
  surfaceId: MissionSurfaceId;
}) {
  if (input.request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const missionId = input.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const mission = resolveSurfaceMission(missionId, input.surfaceId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }
  if (mission.executionTargetMode === "execution_project") {
    return Response.json(
      { error: "Direct execution missions do not have a dedicated workspace to delete." },
      { status: 409 },
    );
  }
  if (!mission.workspacePath) {
    return Response.json({ error: "Mission has no execution workspace." }, { status: 409 });
  }

  const relevantSessionIds = [
    getMissionPrimarySessionId(mission),
    mission.workerSessions.ignis,
    mission.workerSessions.gladiolus,
    mission.workerSessions.prompto,
  ].filter((sessionId, index, values): sessionId is string => {
    return (
      typeof sessionId === "string" && sessionId.length > 0 && values.indexOf(sessionId) === index
    );
  });

  try {
    if (relevantSessionIds.length > 0) {
      try {
        const client = getOpencodeClient();
        await Promise.allSettled(
          relevantSessionIds.map(async (sessionId) => {
            const result = await client.session.abort({ sessionID: sessionId });
            if (result.error) {
              throw new Error(String(result.error));
            }
          }),
        );
      } catch {
        // Best effort only. User-confirmed workspace deletion must still proceed.
      }
    }

    if (
      mission.operationState &&
      (mission.operationState.status === "running" ||
        mission.operationState.status === "waiting_for_report")
    ) {
      saveOperationState(missionId, {
        ...mission.operationState,
        status: "aborted",
      });
    }

    deleteMissionExecutionWorkspace({
      workspacePath: mission.workspacePath,
      force: true,
    });

    clearMissionSessions(missionId);
    updateMissionExecutionContext(missionId, { workspaceStatus: "deleted" });

    return Response.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message.length > 0) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
}