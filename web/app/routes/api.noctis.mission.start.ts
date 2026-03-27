import { getProjectRoot } from "@/lib/get-project-root.server";
import { buildDelegationLedger, createMission, setAgentModels } from "@/lib/mission-store";
import {
  coerceAllowedWorkers,
  getNoctisAgentProfile,
  getNoctisExecutionMode,
} from "@/lib/noctis-working-party";
import { getOpencodeClient } from "@/lib/opencode-client";
import { processCrystalMessage } from "@/lib/operation-engine/engine";
import { getOperationState } from "@/lib/operation-engine/state";
import { buildInjectedPromptContext } from "@/lib/prompt-context.server";
import { buildPromptPayloadParts, type PromptPart, stringifyPromptParts } from "@/lib/prompt-parts";
import { buildRoutedMessageEnvelope } from "@/lib/team-message-format";
import type { AgentId, ModelSelection } from "@/lib/types/mission";
import type { Route } from "./+types/api.noctis.mission.start";

function isModelSelection(value: unknown): value is ModelSelection {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.providerID === "string" && typeof v.modelID === "string";
}

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
  const routedPromptParts: PromptPart[] = [
    {
      type: "text",
      text: buildRoutedMessageEnvelope({
        speaker: "crystal",
        to: "noctis",
        messageType: "chat",
        body: message,
      }),
    },
  ];
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const objective = typeof body.objective === "string" ? body.objective.trim() : message;
  const selectedOperation =
    typeof body.selectedOperation === "string" && body.selectedOperation.trim().length > 0
      ? body.selectedOperation.trim()
      : null;
  const noctisModel = isModelSelection(body.noctisModel) ? body.noctisModel : undefined;
  const allowedWorkers = coerceAllowedWorkers(body.allowedWorkers);
  const executionMode = getNoctisExecutionMode(allowedWorkers);
  const noctisAgentProfile = getNoctisAgentProfile(allowedWorkers);

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
    const client = getOpencodeClient();
    const projectRoot = getProjectRoot();
    const missionId = crypto.randomUUID();

    const sessionResult = await client.session.create({
      query: { directory: projectRoot },
      body: { title: `mission:${missionId}` },
    });

    if (sessionResult.error) {
      return Response.json({ error: sessionResult.error }, { status: 502 });
    }

    const sessionId = sessionResult.data?.id;
    if (!sessionId) {
      return Response.json({ error: "Session creation returned no ID" }, { status: 502 });
    }

    const mission = createMission(missionId, sessionId, {
      title: title || message.slice(0, 80),
      objective,
    });
    setAgentModels(missionId, agentModels);
    const ledger = buildDelegationLedger(mission);

    const injectedContext = buildInjectedPromptContext({
      missionId,
      sessionId,
      agent: noctisAgentProfile,
      allowedWorkers,
      appRoot: projectRoot,
      executionMode,
    });

    // --- OperationEngine Hook 1: detect & activate operation ---
    const engineResult = processCrystalMessage({
      missionId,
      sessionId,
      message,
      isNewMission: true,
      selectedOperation,
    });
    let finalParts = routedPromptParts;
    if (engineResult.additionalContext) {
      finalParts = [
        { type: "text", text: engineResult.additionalContext },
        ...routedPromptParts,
      ];
    }

    const promptResult = await client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: buildPromptPayloadParts(injectedContext, finalParts),
        agent: noctisAgentProfile,
        system: ledger,
        ...(noctisModel ? { model: noctisModel } : {}),
      },
    });

    if (promptResult.error) {
      return Response.json({ error: promptResult.error }, { status: 502 });
    }

    return Response.json({
      missionId,
      noctisSessionId: sessionId,
      operationState: getOperationState(missionId) ?? null,
    });
  } catch {
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
