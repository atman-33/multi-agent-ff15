import type { ActionFunctionArgs } from "react-router";
import {
  appendNoctisMissionRuntimeDebugLog,
  type NoctisMissionRuntimeDebugEvent,
} from "@/lib/noctis-mission-runtime-debug.server";

const DEBUG_EVENTS: ReadonlySet<string> = new Set<NoctisMissionRuntimeDebugEvent["event"]>([
  "primary-session-idle",
  "session-history-sync",
  "settled-evaluation",
  "session-settled-emitted",
]);
const DEBUG_STAGES: ReadonlySet<string> = new Set<NoctisMissionRuntimeDebugEvent["stage"]>([
  "observed",
  "completed",
  "failed",
]);

function isDebugEvent(value: unknown): value is NoctisMissionRuntimeDebugEvent["event"] {
  return typeof value === "string" && DEBUG_EVENTS.has(value);
}

function isDebugStage(value: unknown): value is NoctisMissionRuntimeDebugEvent["stage"] {
  return typeof value === "string" && DEBUG_STAGES.has(value);
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const missionId = params.missionId;
  if (!missionId) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    source?: unknown;
    event?: unknown;
    stage?: unknown;
    sessionId?: unknown;
    payload?: unknown;
  } | null;

  if (!body || body.source !== "client-hook") {
    return Response.json({ error: "Invalid source" }, { status: 400 });
  }

  if (!isDebugEvent(body.event)) {
    return Response.json({ error: "Invalid event" }, { status: 400 });
  }

  if (!isDebugStage(body.stage)) {
    return Response.json({ error: "Invalid stage" }, { status: 400 });
  }

  appendNoctisMissionRuntimeDebugLog({
    source: "client-hook",
    event: body.event,
    stage: body.stage,
    missionId,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
    payload: body.payload,
  });

  return Response.json({ recorded: true });
};