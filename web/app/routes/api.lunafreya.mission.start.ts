import { existsSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { resolveLunafreyaFacetSelection } from "@/lib/lunafreya-facet-selection.server";
import { normalizeIncomingMissionExecutionTargetMode } from "@/lib/mission-execution-target-mode";
import { provisionMissionExecutionWorkspace } from "@/lib/mission-execution-workspace.server";
import { createMission, setAgentModels } from "@/lib/mission-store";
import { isModelSelection, splitModelSelection } from "@/lib/model-variant-selection";
import { getOpencodeClient } from "@/lib/opencode-client";
import { buildBuiltinOperationRef } from "@/lib/operation-definition/operation-catalog";
import { readOperationLanguage } from "@/lib/operation-definition/language";
import { getOperationState } from "@/lib/operation-runtime/state";
import { composeUserToPrimaryAgentPrompt } from "@/lib/prompt-composition-engine";
import { type PromptPart, stringifyPromptParts } from "@/lib/prompt-parts";
import { readRegisteredProjectDefinition } from "@/lib/project-config.server";
import type { AgentId, ModelSelection } from "@/lib/types/mission";

function listBuiltinLanguages(language: string): string[] {
  return language === "en" ? ["en"] : [language, "en"];
}

function resolveLunafreyaOperationRef(root: string, language: string): string {
  const fileName = "lunafreya-autonomous.yaml";
  const preferredLanguage = listBuiltinLanguages(language).find((candidate) =>
    existsSync(join(root, "builtins", candidate, "operations", fileName)),
  );

  if (!preferredLanguage) {
    throw new Error("Hidden Lunafreya workflow is not available.");
  }

  return buildBuiltinOperationRef(preferredLanguage, fileName);
}

export const action = async ({ request }: { request: Request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    parts?: unknown;
    lunafreyaModel?: unknown;
    executionProjectId?: unknown;
    executionTargetMode?: unknown;
    contextProjectIds?: unknown;
    title?: unknown;
    objective?: unknown;
    selectedJobId?: unknown;
    selectedKnowledgeIds?: unknown;
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

  const executionProjectId =
    typeof body.executionProjectId === "string" && body.executionProjectId.trim().length > 0
      ? body.executionProjectId.trim()
      : "";
  if (!executionProjectId) {
    return Response.json({ error: "Missing executionProjectId" }, { status: 400 });
  }

  const executionTargetMode = normalizeIncomingMissionExecutionTargetMode(
    body?.executionTargetMode,
  );
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const message = stringifyPromptParts(promptParts);
  const missionTitle = title || message.slice(0, 80);
  const objective = typeof body.objective === "string" ? body.objective.trim() : message;
  const contextProjectIds = Array.isArray(body?.contextProjectIds)
    ? body.contextProjectIds.filter(
        (projectId): projectId is string => typeof projectId === "string" && projectId.trim().length > 0,
      )
    : [];
  const selectedJobId = typeof body.selectedJobId === "string" ? body.selectedJobId.trim() : undefined;
  const selectedKnowledgeIds = Array.isArray(body.selectedKnowledgeIds)
    ? body.selectedKnowledgeIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  const lunafreyaModel = isModelSelection(body.lunafreyaModel) ? body.lunafreyaModel : undefined;
  const agentModels: Partial<Record<AgentId, ModelSelection>> = {};
  if (lunafreyaModel) {
    agentModels.lunafreya = lunafreyaModel;
  }

  try {
    const client = getOpencodeClient();
    const projectRoot = getProjectRoot();
    const executionProject = readRegisteredProjectDefinition(projectRoot, executionProjectId);
    if (!executionProject) {
      return Response.json({ error: "Execution project is not registered." }, { status: 409 });
    }

    const registeredContextProjectIds = contextProjectIds.filter(
      (projectId) =>
        projectId !== executionProjectId && !!readRegisteredProjectDefinition(projectRoot, projectId),
    );
    const language = readOperationLanguage();
    const facetSelection = resolveLunafreyaFacetSelection({
      root: projectRoot,
      executionProjectId,
      builtinLanguages: listBuiltinLanguages(language),
      selectedJobId,
      selectedKnowledgeIds,
    });
    const selectedOperation = resolveLunafreyaOperationRef(projectRoot, language);
    const missionId = crypto.randomUUID();
    const missionCreatedAt = new Date().toISOString();
    const executionWorkspace =
      executionTargetMode === "mission_workspace"
        ? provisionMissionExecutionWorkspace({
            appRoot: projectRoot,
            createdAt: missionCreatedAt,
            executionProjectId,
            title: missionTitle,
          })
        : null;
    const { model, variant } = splitModelSelection(lunafreyaModel);
    const executionRoot = executionWorkspace?.workspacePath ?? executionProject.rootPath;

    const sessionResult = await client.session.create({
      directory: executionRoot,
      title: `mission:${missionId}`,
    });

    if (sessionResult.error) {
      return Response.json({ error: sessionResult.error }, { status: 502 });
    }

    const sessionId = sessionResult.data?.id;
    if (!sessionId) {
      return Response.json({ error: "Session creation returned no ID" }, { status: 502 });
    }

    createMission(missionId, sessionId, {
      title: missionTitle,
      objective,
      surfaceId: "lunafreya",
      primaryAgentId: "lunafreya",
      lunafreyaFacetSelection: facetSelection.selection,
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

    const composed = composeUserToPrimaryAgentPrompt({
      context: {
        missionId,
        sessionId,
        agent: "lunafreya",
        appRoot: projectRoot,
        executionMode: "solo",
      },
      userMessage: message,
      missionId,
      sessionId,
      isNewMission: true,
      selectedOperation,
      toAgent: "lunafreya",
      workflowExtensionAppend: facetSelection.promptExtension,
    });

    const promptResult = await client.session.promptAsync({
      sessionID: sessionId,
      parts: composed.payloadParts,
      agent: "lunafreya",
      ...(model ? { model } : {}),
      ...(variant ? { variant } : {}),
    });

    if (promptResult.error) {
      return Response.json({ error: promptResult.error }, { status: 502 });
    }

    return Response.json({
      missionId,
      lunafreyaSessionId: sessionId,
      operationState: getOperationState(missionId) ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message.length > 0) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};