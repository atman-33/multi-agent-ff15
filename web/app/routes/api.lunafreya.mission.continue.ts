import { existsSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { DEFAULT_LUNAFREYA_JOB_LABEL } from "@/lib/lunafreya-prompt-context";
import { resolveLunafreyaFacetSelection } from "@/lib/lunafreya-facet-selection.server";
import { resolveMissionExecutionRoot } from "@/lib/mission-execution-workspace.server";
import {
  appendMissionActivity,
  clearMissionSessions,
  getMission,
  getMissionPrimarySessionId,
  setAgentModels,
  setLunafreyaFacetSelection,
  setMissionPrimarySession,
  updateMissionExecutionContext,
} from "@/lib/mission-store";
import { isModelSelection, splitModelSelection } from "@/lib/model-variant-selection";
import { getOpencodeClient } from "@/lib/opencode-client";
import { buildBuiltinOperationRef } from "@/lib/operation-definition/operation-catalog";
import { readOperationLanguage } from "@/lib/operation-definition/language";
import { composeUserToPrimaryAgentPrompt } from "@/lib/prompt-composition-engine";
import { type PromptPart, stringifyPromptParts } from "@/lib/prompt-parts";
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
    throw new Error("Hidden Lunafreya operation is not available.");
  }

  return buildBuiltinOperationRef(preferredLanguage, fileName);
}

function sameSelection(
  left: { selectedJobId?: string; selectedKnowledgeIds: string[] } | null | undefined,
  right: { selectedJobId?: string; selectedKnowledgeIds: string[] },
): boolean {
  if ((left?.selectedJobId ?? undefined) !== (right.selectedJobId ?? undefined)) {
    return false;
  }

  if ((left?.selectedKnowledgeIds.length ?? 0) !== right.selectedKnowledgeIds.length) {
    return false;
  }

  return right.selectedKnowledgeIds.every((id, index) => left?.selectedKnowledgeIds[index] === id);
}

function buildSelectionUpdateBody(input: {
  selectedJobLabel: string | null;
  selectedKnowledgeLabels: string[];
}): string {
  return [
    "Updated Lunafreya prompt context.",
    `Job: ${input.selectedJobLabel ?? DEFAULT_LUNAFREYA_JOB_LABEL}`,
    `Knowledge: ${input.selectedKnowledgeLabels.join(", ") || "none"}`,
  ].join("\n");
}

export const action = async ({ request }: { request: Request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = (await request.json().catch(() => null)) as {
    missionId?: unknown;
    message?: unknown;
    parts?: unknown;
    lunafreyaModel?: unknown;
    selectedJobId?: unknown;
    selectedKnowledgeIds?: unknown;
  } | null;

  if (!body || typeof body.missionId !== "string" || !body.missionId.trim()) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const rawParts = Array.isArray(body.parts)
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
  const fallbackMessage = typeof body.message === "string" ? body.message.trim() : "";
  const promptParts: PromptPart[] =
    rawParts.length > 0
      ? rawParts
      : fallbackMessage
        ? [{ type: "text" as const, text: fallbackMessage }]
        : [];

  if (promptParts.length === 0) {
    return Response.json({ error: "Missing message" }, { status: 400 });
  }

  const missionId = body.missionId.trim();
  const lunafreyaModel = isModelSelection(body.lunafreyaModel) ? body.lunafreyaModel : undefined;
  const agentModels: Partial<Record<AgentId, ModelSelection>> = {};
  if (lunafreyaModel) {
    agentModels.lunafreya = lunafreyaModel;
  }

  const mission = getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }
  if (!mission.executionProjectId) {
    return Response.json(
      { error: "Mission requires an execution project before it can be resumed." },
      { status: 409 },
    );
  }

  const hasSelectedJobId = Object.hasOwn(body, "selectedJobId");
  const hasSelectedKnowledgeIds = Object.hasOwn(body, "selectedKnowledgeIds");
  const currentSelection: { selectedJobId?: string; selectedKnowledgeIds: string[] } =
    mission.lunafreyaFacetSelection ?? {
      selectedKnowledgeIds: [],
    };
  const nextSelectedJobId = hasSelectedJobId
    ? typeof body.selectedJobId === "string" && body.selectedJobId.trim().length > 0
      ? body.selectedJobId.trim()
      : undefined
    : currentSelection.selectedJobId;
  const nextSelectedKnowledgeIds = hasSelectedKnowledgeIds
    ? Array.isArray(body.selectedKnowledgeIds)
      ? body.selectedKnowledgeIds.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
      : []
    : currentSelection.selectedKnowledgeIds;
  const effectiveModel = lunafreyaModel ?? mission.agentModels.lunafreya;
  const { model, variant } = splitModelSelection(effectiveModel);

  try {
    const client = getOpencodeClient();
    const appRoot = getProjectRoot();
    const executionRoot = resolveMissionExecutionRoot({
      appRoot,
      mission,
    });
    if (executionRoot.workspacePath && executionRoot.workspaceStatus) {
      updateMissionExecutionContext(missionId, {
        workspacePath: executionRoot.workspacePath,
        workspaceStatus: executionRoot.workspaceStatus,
      });
    }

    if (executionRoot.recreated) {
      clearMissionSessions(missionId);
    }

    const language = readOperationLanguage();
    const facetSelection = resolveLunafreyaFacetSelection({
      root: appRoot,
      executionProjectId: mission.executionProjectId,
      builtinLanguages: listBuiltinLanguages(language),
      selectedJobId: nextSelectedJobId,
      selectedKnowledgeIds: nextSelectedKnowledgeIds,
    });
    if (!sameSelection(mission.lunafreyaFacetSelection, facetSelection.selection)) {
      const activityCreatedAt = new Date().toISOString();
      setLunafreyaFacetSelection(missionId, facetSelection.selection);
      appendMissionActivity(missionId, {
        id: crypto.randomUUID(),
        actor: "system",
        speaker: "system",
        kind: "system_event",
        body: buildSelectionUpdateBody({
          selectedJobLabel: facetSelection.selectedJobLabel,
          selectedKnowledgeLabels: facetSelection.selectedKnowledgeLabels,
        }),
        createdAt: activityCreatedAt,
        source: {
          type: "system",
          lunafreyaFacetSnapshot: {
            ...facetSelection.selection,
            ...(facetSelection.selectedJobLabel
              ? { selectedJobLabel: facetSelection.selectedJobLabel }
              : {}),
            selectedKnowledgeLabels: facetSelection.selectedKnowledgeLabels,
          },
        },
      });
    }
    setAgentModels(missionId, agentModels);

    let sessionId = getMissionPrimarySessionId(mission);
    if (!sessionId) {
      const sessionResult = await client.session.create({
        directory: executionRoot.executionRoot,
        title: `mission:${missionId}`,
      });

      if (sessionResult.error) {
        return Response.json({ error: sessionResult.error }, { status: 502 });
      }

      sessionId = sessionResult.data?.id;
      if (!sessionId) {
        return Response.json({ error: "Session creation returned no ID" }, { status: 502 });
      }

      setMissionPrimarySession(missionId, "lunafreya", sessionId);
    }

    const userMessage = stringifyPromptParts(promptParts);
    const selectedOperation = resolveLunafreyaOperationRef(appRoot, language);
    const composed = composeUserToPrimaryAgentPrompt({
      context: {
        missionId,
        sessionId,
        agent: "lunafreya",
        appRoot,
        executionMode: "solo",
      },
      userMessage,
      missionId,
      sessionId,
      isNewMission: false,
      selectedOperation,
      toAgent: "lunafreya",
      workflowExtensionAppend: facetSelection.promptExtension,
    });

    const result = await client.session.promptAsync({
      sessionID: sessionId,
      parts: composed.payloadParts,
      agent: "lunafreya",
      ...(model ? { model } : {}),
      ...(variant ? { variant } : {}),
    });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json({ lunafreyaSessionId: sessionId });
  } catch (error) {
    if (error instanceof Error && error.message.length > 0) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};