import { getProjectRoot } from "@/lib/get-project-root.server";
import { normalizeIncomingMissionExecutionTargetMode } from "@/lib/mission-execution-target-mode";
import {
  provisionMissionExecutionWorkspace,
  resolveManagedMissionStartRoots,
} from "@/lib/mission-execution-workspace.server";
import { getManagedSessionTitle } from "@/lib/managed-session-titles";
import {
  claimPrimaryAgentTmuxMissionWriteFocus,
  MissionTransportNotReadyError,
  queueResolvedPrimaryAgentTmuxMissionWrite,
  requireReadyMissionTransport,
  TmuxMissionWriteConflictError,
} from "@/lib/primary-agent-mission-transport.server";
import { buildDelegationLedger, createMission, setAgentModels } from "@/lib/mission-store";
import { isModelSelection, splitModelSelection } from "@/lib/model-variant-selection";
import {
  coerceAllowedWorkers,
  getNoctisExecutionMode,
} from "@/lib/noctis-working-party";
import { getOpencodeClient } from "@/lib/opencode-client";
import {
  listUserFacingOperationCatalogEntriesForScope,
  resolveDefaultUserFacingOperationRef,
} from "@/lib/operation-definition/operation-catalog";
import { readOperationLanguage } from "@/lib/operation-definition/language";
import { getOperationState } from "@/lib/operation-runtime/state";
import { composeUserToNoctisPrompt } from "@/lib/prompt-composition-engine";
import { type PromptPart, stringifyPromptParts } from "@/lib/prompt-parts";
import { readRegisteredProjectDefinition } from "@/lib/project-config.server";
import type { AgentId, ModelSelection } from "@/lib/types/mission";
import type { Route } from "./+types/api.noctis.mission.start";

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    parts?: unknown;
    noctisModel?: unknown;
    workerModels?: unknown;
    allowedWorkers?: unknown;
    selectedOperation?: unknown;
    executionProjectId?: unknown;
    executionTargetMode?: unknown;
    contextProjectIds?: unknown;
    title?: unknown;
    objective?: unknown;
  } | null;
  const rawParts = Array.isArray(body?.parts)
    ? body.parts.filter(
        (part): part is PromptPart =>
          !!part &&
          typeof part === "object" &&
          (((part as Record<string, unknown>).type === "text" &&
            typeof (part as Record<string, unknown>).text === "string") ||
            ((part as Record<string, unknown>).type === "file" &&
              typeof (part as Record<string, unknown>).path === "string" &&
              ((part as Record<string, unknown>).content === undefined ||
                typeof (part as Record<string, unknown>).content === "string")))
      )
    : [];
  const fallbackMessage = typeof body?.message === "string" ? body.message.trim() : "";
  const promptParts: PromptPart[] =
    rawParts.length > 0
      ? rawParts
      : fallbackMessage
        ? [{ type: "text" as const, text: fallbackMessage }]
        : [];

  if (!body || promptParts.length === 0) {
    return Response.json({ error: "Missing message" }, { status: 400 });
  }

  const message = stringifyPromptParts(promptParts);
  const executionProjectId =
    typeof body.executionProjectId === "string" && body.executionProjectId.trim().length > 0
      ? body.executionProjectId.trim()
      : "";
  const executionTargetMode = normalizeIncomingMissionExecutionTargetMode(
    body?.executionTargetMode,
  );
  if (!executionProjectId) {
    return Response.json({ error: "Missing executionProjectId" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const missionTitle = title || message.slice(0, 80);
  const objective = typeof body.objective === "string" ? body.objective.trim() : message;
  const contextProjectIds = Array.isArray(body?.contextProjectIds)
    ? body.contextProjectIds.filter(
        (projectId): projectId is string => typeof projectId === "string" && projectId.trim().length > 0,
      )
    : [];
  const selectedOperationInput =
    typeof body.selectedOperation === "string" && body.selectedOperation.trim().length > 0
      ? body.selectedOperation.trim()
      : null;
  const noctisModel = isModelSelection(body.noctisModel) ? body.noctisModel : undefined;
  const allowedWorkers = coerceAllowedWorkers(body.allowedWorkers);
  const executionMode = getNoctisExecutionMode(allowedWorkers);
  const noctisAgentProfile = "noctis" as const;

  const workerModelsRaw =
    body.workerModels && typeof body.workerModels === "object"
      ? (body.workerModels as Record<string, unknown>)
      : {};
  const agentModels: Partial<Record<AgentId, ModelSelection>> = {};
  if (noctisModel) agentModels.noctis = noctisModel;
  for (const agentId of ["ignis", "gladiolus", "prompto"] as const) {
    const m = workerModelsRaw[agentId];
    if (isModelSelection(m)) agentModels[agentId] = m;
  }

  try {
    const projectRoot = getProjectRoot();
    const transportStatus = await requireReadyMissionTransport({ appRoot: projectRoot });
    const client = getOpencodeClient();
    const missionId = crypto.randomUUID();
    const missionCreatedAt = new Date().toISOString();
    if (transportStatus.transportMode === "tmux-resident") {
      await claimPrimaryAgentTmuxMissionWriteFocus({
        appRoot: projectRoot,
        client,
        missionId,
        updatedAt: missionCreatedAt,
      });
    }
    const executionProject = readRegisteredProjectDefinition(projectRoot, executionProjectId);
    if (!executionProject) {
      return Response.json({ error: "Execution project is not registered." }, { status: 409 });
    }
    const registeredContextProjectIds = contextProjectIds.filter(
      (projectId) =>
        projectId !== executionProjectId && !!readRegisteredProjectDefinition(projectRoot, projectId),
    );
    const language = readOperationLanguage();
    const availableOperationEntries = listUserFacingOperationCatalogEntriesForScope({
      root: projectRoot,
      scope: "noctis_team",
      projectFilterId: executionProjectId,
      builtinLanguages: language === "en" ? ["en"] : [language, "en"],
    });
    if (
      selectedOperationInput &&
      !availableOperationEntries.some((entry) => entry.ref === selectedOperationInput)
    ) {
      return Response.json({ error: "Selected operation is not available for this execution project" }, { status: 409 });
    }
    const selectedOperation =
      selectedOperationInput ??
      resolveDefaultUserFacingOperationRef({
        root: projectRoot,
        scope: "noctis_team",
        projectFilterId: executionProjectId,
        builtinLanguages: language === "en" ? ["en"] : [language, "en"],
      });
    if (!selectedOperation) {
      return Response.json({ error: "No operation is available" }, { status: 409 });
    }
    const executionWorkspace =
      executionTargetMode === "mission_workspace"
        ? provisionMissionExecutionWorkspace({
            appRoot: projectRoot,
            createdAt: missionCreatedAt,
            executionProjectId,
            title: missionTitle,
          })
        : null;
    const { model, variant } = splitModelSelection(noctisModel);
    const managedRoots = resolveManagedMissionStartRoots({
      appRoot: projectRoot,
      executionProject,
      executionTargetMode,
      executionWorkspace,
    });

    const sessionResult = await client.session.create({
      directory: managedRoots.sessionHostRoot,
      title: getManagedSessionTitle(missionId, "noctis"),
    });

    if (sessionResult.error) {
      return Response.json({ error: sessionResult.error }, { status: 502 });
    }

    const sessionId = sessionResult.data?.id;
    if (!sessionId) {
      return Response.json({ error: "Session creation returned no ID" }, { status: 502 });
    }

    const mission = createMission(missionId, sessionId, {
      title: missionTitle,
      objective,
      allowedWorkers,
      executionProjectId,
      executionTargetMode,
      contextProjectIds: registeredContextProjectIds,
      ...(executionWorkspace
        ? {
            baseBranch: executionWorkspace.baseBranch,
            branch: executionWorkspace.branch,
            workspacePath: executionWorkspace.workspacePath,
            workspaceStatus: executionWorkspace.workspaceStatus,
          }
        : {}),
    });
    setAgentModels(missionId, agentModels);
    const ledger = buildDelegationLedger(mission);

    const composed = composeUserToNoctisPrompt({
      context: {
        missionId,
        sessionId,
        agent: noctisAgentProfile,
        allowedWorkers,
        appRoot: projectRoot,
        executionMode,
      },
      userMessage: message,
      missionId,
      sessionId,
      isNewMission: true,
      selectedOperation,
    });

    if (transportStatus.transportMode === "tmux-resident") {
      await queueResolvedPrimaryAgentTmuxMissionWrite({
        agentId: noctisAgentProfile,
        appRoot: projectRoot,
        client,
        missionId,
        parts: composed.payloadParts,
        sessionId,
        system: ledger,
        ...(model ? { model } : {}),
        ...(variant ? { variant } : {}),
      });

      return Response.json({
        missionId,
        noctisSessionId: sessionId,
        operationState: getOperationState(missionId) ?? null,
      });
    }

    const promptResult = await client.session.promptAsync({
      sessionID: sessionId,
      parts: composed.payloadParts,
      agent: noctisAgentProfile,
      system: ledger,
      ...(model ? { model } : {}),
      ...(variant ? { variant } : {}),
    });

    if (promptResult.error) {
      return Response.json({ error: promptResult.error }, { status: 502 });
    }

    return Response.json({
      missionId,
      noctisSessionId: sessionId,
      operationState: getOperationState(missionId) ?? null,
    });
  } catch (error) {
    if (error instanceof MissionTransportNotReadyError) {
      return Response.json({ error: error.message }, { status: 503 });
    }

    if (error instanceof TmuxMissionWriteConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof Error && error.message.length > 0) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
