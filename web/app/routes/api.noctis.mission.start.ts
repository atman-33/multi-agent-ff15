import type { Route } from "./+types/api.noctis.mission.start";
import { getOpencodeClient } from "@/lib/opencode-client";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { buildInjectedPromptContext } from "@/lib/prompt-context.server";
import { createMission, buildDelegationLedger, setAgentModels } from "@/lib/mission-store";
import type { ModelSelection, AgentId } from "@/lib/types/mission";

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
    message?: unknown;
    noctisModel?: unknown;
    workerModels?: unknown;
    title?: unknown;
    objective?: unknown;
  } | null;
  if (!body || typeof body.message !== "string" || !body.message.trim()) {
    return Response.json({ error: "Missing message" }, { status: 400 });
  }

  const message = body.message.trim();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const objective = typeof body.objective === "string" ? body.objective.trim() : message;
  const noctisModel = isModelSelection(body.noctisModel) ? body.noctisModel : undefined;

  const workerModelsRaw = body.workerModels && typeof body.workerModels === "object"
    ? body.workerModels as Record<string, unknown>
    : {};
  const agentModels: Partial<Record<AgentId, ModelSelection>> = {};
  if (noctisModel) agentModels["noctis"] = noctisModel;
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
      sessionId,
      agent: "noctis",
      appRoot: projectRoot,
    });

    const promptResult = await client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: [
          { type: "text", text: injectedContext },
          { type: "text", text: message },
        ],
        agent: "noctis",
        system: ledger,
        ...(noctisModel ? { model: noctisModel } : {}),
      },
    });

    if (promptResult.error) {
      return Response.json({ error: promptResult.error }, { status: 502 });
    }

    return Response.json({ missionId, noctisSessionId: sessionId });
  } catch {
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
