import { readOperationLanguage } from "@/lib/operation-definition/language";
import { loadOperationByName } from "@/lib/operation-definition/operation-loader";
import { updateTask } from "@/lib/mission-store";
import { processReport } from "@/lib/operation-runtime/runtime";
import { getOperationState, saveOperationState } from "@/lib/operation-runtime/state";
import { buildTextSection, joinXmlSections } from "@/lib/prompt-composition-engine/prompt-xml";
import { dispatchCurrentOperationStepToWorker } from "@/lib/task-dispatch.server";
import { sendWorkerReport } from "@/lib/team-message.server";
import type { ReportStatus, WorkerAgentId, WorkerResult } from "@/lib/types/mission";
import type { Route } from "./+types/route";

const WORKER_IDS: ReadonlySet<string> = new Set<WorkerAgentId>(["ignis", "gladiolus", "prompto"]);
const REPORT_STATUSES: ReadonlySet<string> = new Set<ReportStatus>([
  "running",
  "blocked",
  "completed",
  "failed",
]);

function isWorkerId(value: unknown): value is WorkerAgentId {
  return typeof value === "string" && WORKER_IDS.has(value);
}

function isReportStatus(value: unknown): value is ReportStatus {
  return typeof value === "string" && REPORT_STATUSES.has(value);
}

function toRuleIndex(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return undefined;
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
    ruleIndex?: unknown;
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
    const ruleIndex = toRuleIndex(body.ruleIndex);
    const isTerminalReport = body.status !== "running";
    const artifacts = Array.isArray(body.artifacts)
      ? body.artifacts.filter((item): item is string => typeof item === "string")
      : [];

    const operationState = getOperationState(missionId);
    let workflowGuidance: string | undefined;
    let handoffMode: "auto" | "manual" = "manual";
    let autoDispatch:
      | { agentId: WorkerAgentId; stepName: string; taskId: string; sessionId: string }
      | undefined;

    if (operationState && (operationState.status === "running" || operationState.status === "waiting_for_report")) {
      const operation = loadOperationByName(operationState.operationName, readOperationLanguage());
      const currentStep = operation.steps.find((step) => step.name === operationState.currentStep);
      const latestStep = operationState.stepHistory.at(-1);

      if (currentStep?.agent !== body.fromAgent) {
        return Response.json(
          {
            error: `Current step expects reports from ${currentStep?.agent ?? "the active agent"}`,
            currentStep: currentStep?.name ?? null,
          },
          { status: 409 },
        );
      }

      if (latestStep?.taskId && latestStep.taskId !== taskId) {
        return Response.json(
          {
            error: "Unexpected taskId for the active workflow step",
            expectedTaskId: latestStep.taskId,
            receivedTaskId: taskId,
          },
          { status: 409 },
        );
      }

      if (isTerminalReport && currentStep && currentStep.rules.length > 0) {
        if (ruleIndex === undefined || ruleIndex < 0 || ruleIndex >= currentStep.rules.length) {
          return Response.json(
            {
              error: "Invalid ruleIndex",
              allowedRuleIndices: currentStep.rules.map((rule, index) => ({
                index,
                condition: rule.condition,
              })),
            },
            { status: 400 },
          );
        }
      }

      if (isTerminalReport) {
        const reportResult = processReport({
          operationState,
          reportBody: summary,
          reportDetails: details,
          fromAgent: body.fromAgent,
          taskId,
          reportStatus: body.status,
          ruleIndex,
        });

        workflowGuidance = reportResult.noctisGuidance || undefined;

        if (reportResult.stateTransition) {
          saveOperationState(missionId, operationState);
        }

        if (reportResult.nextWorkerDispatch) {
          try {
            const dispatched = await dispatchCurrentOperationStepToWorker({ missionId });
            handoffMode = "auto";
            autoDispatch = {
              agentId: dispatched.agentId,
              stepName: dispatched.stepName,
              taskId: dispatched.taskId,
              sessionId: dispatched.sessionId,
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            workflowGuidance = joinXmlSections([
              buildTextSection("operation-note", `Automatic handoff failed: ${message}`),
              workflowGuidance ?? null,
            ]);
          }
        }
      }
    }

    const result: WorkerResult = {
      task_id: taskId,
      status: body.status,
      summary,
      artifacts,
      ...(typeof ruleIndex === "number" ? { ruleIndex } : {}),
    };

    updateTask(missionId, taskId, body.status, summary, result);

    if (autoDispatch) {
      return Response.json({
        handoffMode,
        dispatchedTo: autoDispatch.agentId,
        nextStep: autoDispatch.stepName,
        taskId: autoDispatch.taskId,
        sessionId: autoDispatch.sessionId,
      });
    }

    const delivery = await sendWorkerReport({
      missionId,
      fromAgent: body.fromAgent,
      taskId,
      status: body.status,
      summary,
      details,
      ruleIndex,
      artifacts,
      workflowGuidance,
    });

    return Response.json({ ...delivery, handoffMode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send report";
    const status = message === "Mission not found" ? 404 : 503;
    return Response.json({ error: message }, { status });
  }
};