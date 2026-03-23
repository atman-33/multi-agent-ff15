import { updateTask } from "@/lib/mission-store";
import { sendWorkerReport } from "@/lib/team-message.server";
import type { AgentId, ReportStatus, WorkerResult } from "@/lib/types/mission";
import type { Route } from "./+types/api.missions.$missionId.reports";

const WORKER_IDS: ReadonlySet<string> = new Set<AgentId>(["ignis", "gladiolus", "prompto"]);
const REPORT_STATUSES: ReadonlySet<string> = new Set<ReportStatus>([
  "running",
  "blocked",
  "completed",
  "failed",
]);

function isWorkerId(value: unknown): value is AgentId {
  return typeof value === "string" && WORKER_IDS.has(value);
}

function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === "string" && REPORT_STATUSES.has(value);
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
    fromAgent?: unknown;
    taskId?: unknown;
    status?: unknown;
    summary?: unknown;
    details?: unknown;
    artifacts?: unknown;
  } | null;

  if (!body || !isWorkerId(body.fromAgent)) {
    return Response.json({ error: "Invalid fromAgent" }, { status: 400 });
  }
  if (typeof body.taskId !== "string" || !body.taskId.trim()) {
    return Response.json({ error: "Missing taskId" }, { status: 400 });
  }
  if (!isReportStatus(body.status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }
  if (typeof body.summary !== "string" || !body.summary.trim()) {
    return Response.json({ error: "Missing summary" }, { status: 400 });
  }

  try {
    const taskId = body.taskId.trim();
    const summary = body.summary.trim();
    const details = typeof body.details === "string" ? body.details.trim() : undefined;
    const artifacts = Array.isArray(body.artifacts)
      ? body.artifacts.filter((item): item is string => typeof item === "string")
      : [];

    const result: WorkerResult = {
      task_id: taskId,
      status: body.status,
      summary,
      artifacts,
    };

    updateTask(missionId, taskId, body.status, summary, result);

    const delivery = await sendWorkerReport({
      missionId,
      fromAgent: body.fromAgent,
      taskId,
      status: body.status,
      summary,
      details,
      artifacts,
    });

    return Response.json(delivery);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send report";
    const status = message === "Mission not found" ? 404 : 503;
    return Response.json({ error: message }, { status });
  }
};
