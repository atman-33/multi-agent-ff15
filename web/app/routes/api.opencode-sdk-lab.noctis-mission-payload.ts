import { rmSync } from "node:fs";
import type { ActionFunctionArgs } from "react-router";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { resolveMissionExecutionRoot } from "@/lib/mission-execution-workspace.server";
import {
  createMission,
  deleteMission,
  getMission,
  getMissionDir,
  setAgentModels,
  setAllowedWorkers,
} from "@/lib/mission-store";
import { isModelSelection, splitModelSelection } from "@/lib/model-variant-selection";
import {
  coerceAllowedWorkers,
  getNoctisExecutionMode,
} from "@/lib/noctis-working-party";
import { saveOperationState } from "@/lib/operation-runtime/state";
import { appendOpencodeSdkLabDebugLog } from "@/lib/opencode-sdk-lab.server";
import { composeUserToNoctisPrompt } from "@/lib/prompt-composition-engine";
import { type PromptPart, type TextPromptPart, stringifyPromptParts } from "@/lib/prompt-parts";

type PreviewPayload = {
  allowedWorkers?: unknown;
  message?: unknown;
  missionId?: unknown;
  noctisModel?: unknown;
  parts?: unknown;
  sessionId?: unknown;
};

type PreviewMission = NonNullable<ReturnType<typeof getMission>>;

function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePromptParts(body: PreviewPayload | null): PromptPart[] {
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
                typeof (part as Record<string, unknown>).content === "string"))),
      )
    : [];
  if (rawParts.length > 0) {
    return rawParts;
  }

  const fallbackMessage = getOptionalString(body?.message);
  return fallbackMessage ? [{ type: "text", text: fallbackMessage }] : [];
}

function cloneOperationState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function replaceToken(value: string | null, from: string, to: string): string | null {
  if (!value) {
    return value;
  }

  return value.split(from).join(to);
}

function replaceTokenInParts(parts: TextPromptPart[], from: string, to: string): TextPromptPart[] {
  return parts.map((part) => ({
    ...part,
    text: part.text.split(from).join(to),
  }));
}

function createTemporaryMissionClone(input: {
  mission: PreviewMission;
  tempMissionId: string;
  sessionId: string;
  allowedWorkers: PreviewMission["allowedWorkers"];
}): void {
  createMission(input.tempMissionId, input.sessionId, {
    title: input.mission.title,
    objective: input.mission.objective,
    surfaceId: input.mission.surfaceId,
    primaryAgentId: input.mission.primaryAgentId,
    lunafreyaFacetSelection: input.mission.lunafreyaFacetSelection,
    allowedWorkers: input.allowedWorkers,
    executionProjectId: input.mission.executionProjectId,
    executionTargetMode: input.mission.executionTargetMode,
    contextProjectIds: input.mission.contextProjectIds,
    baseBranch: input.mission.baseBranch,
    branch: input.mission.branch,
    workspacePath: input.mission.workspacePath,
    workspaceStatus: input.mission.workspaceStatus,
  });
  setAgentModels(input.tempMissionId, input.mission.agentModels);
  setAllowedWorkers(input.tempMissionId, input.allowedWorkers);

  if (input.mission.operationState) {
    saveOperationState(input.tempMissionId, cloneOperationState(input.mission.operationState));
  }
}

function cleanupTemporaryMission(tempMissionId: string | null): void {
  if (!tempMissionId) {
    return;
  }

  deleteMission(tempMissionId);
  rmSync(getMissionDir(tempMissionId), { force: true, recursive: true });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const requestId = crypto.randomUUID();
  const body = (await request.json().catch(() => null)) as PreviewPayload | null;
  const missionId = getOptionalString(body?.missionId);
  const promptParts = parsePromptParts(body);

  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  if (promptParts.length === 0) {
    return Response.json({ error: "Missing message" }, { status: 400 });
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

  const allowedWorkers =
    body?.allowedWorkers === undefined
      ? mission.allowedWorkers
      : coerceAllowedWorkers(body.allowedWorkers);
  const executionMode = getNoctisExecutionMode(allowedWorkers);
  const previewSessionId =
    getOptionalString(body?.sessionId) ?? mission.primarySessionId ?? mission.noctisSessionId;
  const effectiveModel = isModelSelection(body?.noctisModel)
    ? body.noctisModel
    : mission.agentModels.noctis;
  const { model, variant } = splitModelSelection(effectiveModel);
  const modelRef = model ? `${model.providerID}/${model.modelID}` : null;
  const appRoot = getProjectRoot();
  const userMessage = stringifyPromptParts(promptParts);

  if (!previewSessionId) {
    return Response.json({ error: "Mission is missing a sessionId" }, { status: 409 });
  }

  appendOpencodeSdkLabDebugLog({
    stage: "mission-preview-request",
    requestId,
    sessionId: previewSessionId,
    payload: {
      allowedWorkers,
      missionId,
      modelRef,
      parts: promptParts,
      variant: variant ?? null,
    },
  });

  let tempMissionId: string | null = null;

  try {
    const executionRoot = resolveMissionExecutionRoot({
      appRoot,
      mission,
    });

    tempMissionId = `opencode-sdk-lab-preview-${crypto.randomUUID()}`;
    createTemporaryMissionClone({
      mission,
      tempMissionId,
      sessionId: previewSessionId,
      allowedWorkers,
    });

    const composed = composeUserToNoctisPrompt({
      context: {
        agent: "noctis",
        allowedWorkers,
        appRoot,
        executionMode,
        missionId,
        sessionId: previewSessionId,
      },
      userMessage,
      missionId: tempMissionId,
      sessionId: previewSessionId,
      isNewMission: false,
    });

    const payloadParts = replaceTokenInParts(composed.payloadParts, tempMissionId, missionId);
    const responsePayload = {
      action: "noctis-mission-payload",
      agent: "noctis",
      allowedWorkers,
      effectivePrompt: replaceToken(composed.effectivePrompt, tempMissionId, missionId),
      executionMode,
      executionRoot: executionRoot.executionRoot,
      missionId,
      modelRef,
      operationActivated: composed.operationActivated ?? null,
      payloadParts,
      payloadText: payloadParts.map((part) => part.text).join(""),
      promptBody: replaceToken(composed.promptBody, tempMissionId, missionId),
      sessionId: previewSessionId,
      sharedContext: composed.sharedContext,
      stateTransition: composed.stateTransition ?? null,
      suppressedContext: composed.suppressedContext,
      userMessage,
      variant: variant ?? null,
      workflowExtension: replaceToken(composed.workflowExtension, tempMissionId, missionId),
    };

    appendOpencodeSdkLabDebugLog({
      stage: "mission-preview-result",
      requestId,
      sessionId: previewSessionId,
      payload: {
        effectivePromptLength: responsePayload.effectivePrompt?.length ?? 0,
        missionId,
        operationActivated: responsePayload.operationActivated,
        partCount: responsePayload.payloadParts.length,
      },
    });

    return Response.json(responsePayload);
  } catch (error) {
    appendOpencodeSdkLabDebugLog({
      stage: "mission-preview-error",
      requestId,
      sessionId: previewSessionId,
      payload: {
        error,
        missionId,
      },
    });

    const message = error instanceof Error ? error.message : "Failed to compose mission payload";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    cleanupTemporaryMission(tempMissionId);
  }
};