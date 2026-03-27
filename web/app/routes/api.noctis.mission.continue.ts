import { getProjectRoot } from "@/lib/get-project-root.server";
import { getMission } from "@/lib/mission-store";
import {
  coerceAllowedWorkers,
  getNoctisAgentProfile,
  getNoctisExecutionMode,
} from "@/lib/noctis-working-party";
import { getOpencodeClient } from "@/lib/opencode-client";
import { processCrystalMessage } from "@/lib/operation-engine/engine";
import { buildInjectedPromptContext } from "@/lib/prompt-context.server";
import { buildPromptPayloadParts, type PromptPart, stringifyPromptParts } from "@/lib/prompt-parts";
import { buildRoutedMessageEnvelope } from "@/lib/team-message-format";
import type { ModelSelection } from "@/lib/types/mission";
import type { Route } from "./+types/api.noctis.mission.continue";

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
    missionId?: unknown;
    message?: unknown;
    parts?: unknown;
    noctisModel?: unknown;
    allowedWorkers?: unknown;
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
  const routedPromptParts: PromptPart[] = [
    {
      type: "text",
      text: buildRoutedMessageEnvelope({
        speaker: "crystal",
        to: "noctis",
        messageType: "chat",
        body: stringifyPromptParts(promptParts),
      }),
    },
  ];
  const noctisModel = isModelSelection(body.noctisModel) ? body.noctisModel : undefined;
  const allowedWorkers = coerceAllowedWorkers(body.allowedWorkers);
  const executionMode = getNoctisExecutionMode(allowedWorkers);
  const noctisAgentProfile = getNoctisAgentProfile(allowedWorkers);

  const mission = getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  const effectiveModel = noctisModel ?? mission.agentModels.noctis;

  try {
    const client = getOpencodeClient();
    const appRoot = getProjectRoot();
    const injectedContext = buildInjectedPromptContext({
      missionId,
      sessionId: mission.noctisSessionId,
      agent: noctisAgentProfile,
      allowedWorkers,
      appRoot,
      executionMode,
    });

    // Hook 1: Operation Engine – continue flow
    // Retrieve last Noctis response for self-movement [STEP:N] detection
    let lastNoctisResponse: string | undefined;
    try {
      const msgs = await client.session.messages({
        path: { id: mission.noctisSessionId },
      });
      if (msgs.data) {
        for (let i = msgs.data.length - 1; i >= 0; i--) {
          const msg = msgs.data[i];
          if (msg?.info.role === "assistant") {
            lastNoctisResponse = msg.parts
              .filter((p) => p.type === "text")
              .map((p) => p.text ?? "")
              .join("");
            break;
          }
        }
      }
    } catch {
      // Non-blocking: proceed without last response
    }

    const crystalMessage = stringifyPromptParts(promptParts);
    const hookResult = processCrystalMessage(
      {
        missionId,
        sessionId: mission.noctisSessionId,
        message: crystalMessage,
        isNewMission: false,
      },
      lastNoctisResponse,
    );

    const finalParts: PromptPart[] = hookResult.additionalContext
      ? [{ type: "text", text: hookResult.additionalContext }, ...routedPromptParts]
      : routedPromptParts;

    const result = await client.session.promptAsync({
      path: { id: mission.noctisSessionId },
      body: {
        parts: buildPromptPayloadParts(injectedContext, finalParts),
        agent: noctisAgentProfile,
        ...(effectiveModel ? { model: effectiveModel } : {}),
      },
    });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json({ noctisSessionId: mission.noctisSessionId });
  } catch {
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
