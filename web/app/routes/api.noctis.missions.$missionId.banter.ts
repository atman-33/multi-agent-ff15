import { recordAmbientBanter } from "@/lib/banter/ambient-service";
import type { BanterCue } from "@/lib/banter/types";
import type { AgentId } from "@/lib/types/mission";
import type { Route } from "./+types/api.noctis.missions.$missionId.banter";

const AGENT_IDS: ReadonlySet<string> = new Set<AgentId>(["noctis", "ignis", "gladiolus", "prompto"]);
const BANTER_CUES: ReadonlySet<string> = new Set<BanterCue>([
  "session-start",
  "task-delegated",
  "task-assigned",
  "message-received",
  "task-progress-early",
  "task-progress-late",
  "report-running",
  "report-blocked",
  "report-completed",
  "report-failed",
  "report-acknowledged",
  "session-settled",
  "task-completed",
  "task-failed",
  "task-retrying",
  "runtime-recovered",
]);

function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && AGENT_IDS.has(value);
}

function isBanterCue(value: unknown): value is BanterCue {
  return typeof value === "string" && BANTER_CUES.has(value);
}

export const action = async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    speakerAgent?: unknown;
    cue?: unknown;
    renderedMessage?: unknown;
    sourceEvent?: unknown;
    createdAt?: unknown;
  } | null;

  if (!body || !isAgentId(body.speakerAgent)) {
    return Response.json({ error: "Invalid speakerAgent" }, { status: 400 });
  }

  if (!isBanterCue(body.cue)) {
    return Response.json({ error: "Invalid cue" }, { status: 400 });
  }

  const entry = recordAmbientBanter({
    missionId,
    speakerAgent: body.speakerAgent,
    cue: body.cue,
    renderedMessage: typeof body.renderedMessage === "string" ? body.renderedMessage : undefined,
    sourceEvent: typeof body.sourceEvent === "string" ? body.sourceEvent : undefined,
  });

  return Response.json({ recorded: Boolean(entry), entry });
};