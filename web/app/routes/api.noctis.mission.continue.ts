import { getProjectRoot } from "@/lib/get-project-root.server";
import { getManagedSessionTitle } from "@/lib/managed-session-titles";
import { resolveMissionExecutionRoot } from "@/lib/mission-execution-workspace.server";
import { getMissionCompatibilityIssue } from "@/lib/mission-runtime-compatibility.server";
import {
  clearMissionSessions,
  getMission,
  setAllowedWorkers,
  setNoctisSession,
  updateMissionExecutionContext,
} from "@/lib/mission-store";
import { isModelSelection, splitModelSelection } from "@/lib/model-variant-selection";
import { coerceAllowedWorkers, getNoctisExecutionMode } from "@/lib/noctis-working-party";
import { getOpencodeClient } from "@/lib/opencode-client";
import {
  claimPrimaryAgentTmuxMissionWriteFocus,
  MissionTransportNotReadyError,
  queueResolvedPrimaryAgentTmuxMissionWrite,
  requireReadyMissionTransport,
  TmuxMissionWriteConflictError,
} from "@/lib/primary-agent-mission-transport.server";
import { composeUserToNoctisPrompt } from "@/lib/prompt-composition-engine";
import { type PromptPart, stringifyPromptParts } from "@/lib/prompt-parts";
import { resolveOwnerEndpointTarget } from "@/lib/session-owner-routing.server";
import { appendSessionPromptDebugLog } from "@/lib/session-prompt-debug.server";
import type { Route } from "./+types/api.noctis.mission.continue";

async function canResolveSessionOnEndpoint(
  endpointUrl: string | null | undefined,
  sessionId: string
): Promise<boolean> {
  if (!endpointUrl) {
    return false;
  }

  try {
    const response = await fetch(new URL(`/session/${encodeURIComponent(sessionId)}`, endpointUrl));
    return response.ok;
  } catch {
    return false;
  }
}

async function hasSessionOnClient(
  client: ReturnType<typeof getOpencodeClient>,
  sessionId: string,
  endpointUrl: string | null | undefined
): Promise<boolean> {
  const listSessions = client.session.list;
  if (typeof listSessions === "function") {
    try {
      const result = await listSessions();
      if (!result.error && Array.isArray(result.data)) {
        const hasExactMatch = result.data.some((session) => session?.id === sessionId);
        if (hasExactMatch) {
          return true;
        }
      }
    } catch {
      // Fall through to a direct continuity probe when the session list is incomplete.
    }
  }

  return canResolveSessionOnEndpoint(endpointUrl, sessionId);
}

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const requestId = crypto.randomUUID();

  const body = (await request.json().catch(() => null)) as {
    missionId?: unknown;
    message?: unknown;
    parts?: unknown;
    noctisModel?: unknown;
    allowedWorkers?: unknown;
  } | null;
  const requestedMissionId = typeof body?.missionId === "string" ? body.missionId.trim() : null;

  appendSessionPromptDebugLog({
    route: "api.noctis.mission.continue",
    stage: "request-received",
    requestId,
    payload: {
      body: body ?? null,
      requestedMissionId,
    },
  });

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
  const noctisModel = isModelSelection(body.noctisModel) ? body.noctisModel : undefined;

  const mission = getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }
  const compatibilityIssue = getMissionCompatibilityIssue(mission);
  if (compatibilityIssue) {
    return Response.json({ error: compatibilityIssue.message }, { status: 409 });
  }
  if (!mission.executionProjectId) {
    return Response.json(
      { error: "Mission requires an execution project before it can be resumed." },
      { status: 409 }
    );
  }

  const allowedWorkers =
    body.allowedWorkers === undefined
      ? mission.allowedWorkers
      : coerceAllowedWorkers(body.allowedWorkers);
  setAllowedWorkers(missionId, allowedWorkers);
  const executionMode = getNoctisExecutionMode(allowedWorkers);
  const noctisAgentProfile = "noctis" as const;

  const effectiveModel = noctisModel ?? mission.agentModels.noctis;
  const { model, variant } = splitModelSelection(effectiveModel);

  try {
    const appRoot = getProjectRoot();
    const transportStatus = await requireReadyMissionTransport({
      appRoot,
      transportMode: mission.transportMode,
    });
    const ownerEndpointTarget =
      transportStatus.transportMode === "tmux-resident"
        ? resolveOwnerEndpointTarget(noctisAgentProfile, `mission continue ${missionId}`)
        : null;
    const client = ownerEndpointTarget?.client ?? getOpencodeClient();
    if (transportStatus.transportMode === "tmux-resident") {
      await claimPrimaryAgentTmuxMissionWriteFocus({
        appRoot,
        client,
        missionId,
      });
    }
    const missionDebugContext = {
      allowedWorkers,
      executionProjectId: mission.executionProjectId,
      operationRef: mission.operationState?.operationRef ?? null,
      currentStep: mission.operationState?.currentStep ?? null,
    };
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

    let sessionId = mission.noctisSessionId;
    let sessionRecreated = false;
    const needsManagedSessionRecreation =
      !sessionId ||
      (transportStatus.transportMode === "tmux-resident" &&
        !(await hasSessionOnClient(client, sessionId, ownerEndpointTarget?.endpointUrl)));
    if (needsManagedSessionRecreation) {
      const sessionResult = await client.session.create({
        directory: executionRoot.sessionHostRoot,
        title: getManagedSessionTitle(missionId, "noctis"),
      });

      if (sessionResult.error) {
        return Response.json({ error: sessionResult.error }, { status: 502 });
      }

      sessionId = sessionResult.data?.id;
      if (!sessionId) {
        return Response.json({ error: "Session creation returned no ID" }, { status: 502 });
      }

      setNoctisSession(missionId, sessionId);
      sessionRecreated = true;
    }

    const userMessage = stringifyPromptParts(promptParts);
    const composed = composeUserToNoctisPrompt({
      context: {
        missionId,
        sessionId,
        agent: noctisAgentProfile,
        allowedWorkers,
        appRoot,
        executionMode,
      },
      userMessage,
      missionId,
      sessionId,
      isNewMission: false,
    });

    if (transportStatus.transportMode === "tmux-resident") {
      appendSessionPromptDebugLog({
        route: "api.noctis.mission.continue",
        stage: "prompt-dispatched",
        requestId,
        sessionId,
        payload: {
          sessionID: sessionId,
          model: model ?? null,
          variant: variant ?? null,
          agent: noctisAgentProfile,
          parts: composed.payloadParts,
          mission: {
            missionId,
            sessionRecreated,
            ...missionDebugContext,
          },
        },
      });

      await queueResolvedPrimaryAgentTmuxMissionWrite({
        agentId: noctisAgentProfile,
        appRoot,
        client,
        missionId,
        parts: composed.payloadParts,
        sessionId,
        ...(model ? { model } : {}),
        ...(variant ? { variant } : {}),
      });

      return Response.json({ noctisSessionId: sessionId });
    }

    appendSessionPromptDebugLog({
      route: "api.noctis.mission.continue",
      stage: "prompt-dispatched",
      requestId,
      sessionId,
      payload: {
        sessionID: sessionId,
        model: model ?? null,
        variant: variant ?? null,
        agent: noctisAgentProfile,
        parts: composed.payloadParts,
        mission: {
          missionId,
          sessionRecreated,
          ...missionDebugContext,
        },
      },
    });

    const result = await client.session.promptAsync({
      sessionID: sessionId,
      parts: composed.payloadParts,
      agent: noctisAgentProfile,
      ...(model ? { model } : {}),
      ...(variant ? { variant } : {}),
    });

    appendSessionPromptDebugLog({
      route: "api.noctis.mission.continue",
      stage: result.error ? "prompt-error" : "prompt-result",
      requestId,
      sessionId,
      payload: {
        error: result.error ?? null,
        mission: {
          missionId,
          sessionRecreated,
          ...missionDebugContext,
        },
      },
    });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json({ noctisSessionId: sessionId });
  } catch (error) {
    appendSessionPromptDebugLog({
      route: "api.noctis.mission.continue",
      stage: "prompt-error",
      requestId,
      payload: {
        error,
        missionId,
      },
    });

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
