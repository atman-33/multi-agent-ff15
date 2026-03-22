import type { Route } from "./+types/api.noctis.mission.continue";
import { getOpencodeClient } from "@/lib/opencode-client";
import { getMission } from "@/lib/mission-store";
import {
  buildPromptPayloadParts,
  stringifyPromptParts,
  type PromptPart,
} from "@/lib/prompt-parts";
import { buildInjectedPromptContext } from "@/lib/prompt-context.server";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { buildRoutedMessageEnvelope } from "@/lib/team-message-format";
import type { ModelSelection } from "@/lib/types/mission";

function isModelSelection(value: unknown): value is ModelSelection {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.providerID === "string" && typeof v.modelID === "string";
}

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json().catch(() => null) as {
    missionId?: unknown;
    message?: unknown;
    parts?: unknown;
    noctisModel?: unknown;
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
  const promptParts: PromptPart[] = rawParts.length > 0
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

  const mission = getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  const effectiveModel = noctisModel ?? mission.agentModels["noctis"];

  try {
    const client = getOpencodeClient();
    const injectedContext = buildInjectedPromptContext({
      missionId,
      sessionId: mission.noctisSessionId,
      agent: "noctis",
      appRoot: getProjectRoot(),
    });

    const result = await client.session.promptAsync({
      path: { id: mission.noctisSessionId },
      body: {
        parts: buildPromptPayloadParts(injectedContext, routedPromptParts),
        agent: "noctis",
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
