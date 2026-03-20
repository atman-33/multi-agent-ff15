import type { Route } from "./+types/api.noctis.mission.continue";
import { getOpencodeClient } from "@/lib/opencode-client";
import { getMission } from "@/lib/mission-store";
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
    noctisModel?: unknown;
  } | null;

  if (!body || typeof body.missionId !== "string" || !body.missionId.trim()) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }
  if (typeof body.message !== "string" || !body.message.trim()) {
    return Response.json({ error: "Missing message" }, { status: 400 });
  }

  const missionId = body.missionId.trim();
  const message = body.message.trim();
  const noctisModel = isModelSelection(body.noctisModel) ? body.noctisModel : undefined;

  const mission = getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  const effectiveModel = noctisModel ?? mission.agentModels["noctis"];

  try {
    const client = getOpencodeClient();
    const result = await client.session.promptAsync({
      path: { id: mission.noctisSessionId },
      body: {
        parts: [{ type: "text", text: message }],
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
