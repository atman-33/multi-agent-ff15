import { existsSync } from "node:fs";
import { loadOperationByRef } from "@/lib/operation-definition/operation-catalog";
import { getMissionOutputFilePath, updateTask } from "@/lib/mission-store";
import { hasDelegationPolicy } from "@/lib/operation-runtime/autonomous";
import { createOperationInstantiator } from "@/lib/operation-runtime/operation-instantiator";
import {
  getDelegatedTaskRecord,
  getOperationRef,
  getOperationState,
} from "@/lib/operation-runtime/state";
import { buildTextSection, joinXmlSections } from "@/lib/prompt-composition-engine/prompt-xml";
import { dispatchCurrentOperationStepToWorker } from "@/lib/task-dispatch.server";
import { sendWorkerReport } from "@/lib/team-message.server";
import { getRuntimeScriptPath } from "@/lib/runtime-script-path";
import type { AgentId, ReportStatus, StepResult, WorkerAgentId } from "@/lib/types/mission";
import type { Route } from "./+types/route";

const AGENT_IDS: ReadonlySet<string> = new Set<AgentId>(["noctis", "ignis", "gladiolus", "prompto"]);
const operationInstantiator = createOperationInstantiator();

function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && AGENT_IDS.has(value);
}

function deriveReportStatus(next: string): ReportStatus {
  return next === "ABORT" ? "failed" : "completed";
}

function deriveTaskStatus(next: string): "completed" | "failed" {
  return next === "ABORT" ? "failed" : "completed";
}

function summarizeMessage(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized.length > 160 ? `${normalized.slice(0, 157).trimEnd()}...` : normalized;
}

function listAllowedNextValues(rules: Array<{ condition: string; next: string }>): string[] {
  return [...new Set(rules.map((rule) => rule.next).filter((value) => value.trim().length > 0))];
}

function listMissingRequiredOutputs(input: {
  missionId: string;
  stepName: string;
  taskId: string;
  reports: Array<{ name: string }>;
}): string[] {
  return input.reports
    .map((report) =>
      getMissionOutputFilePath(input.missionId, input.stepName, input.taskId, report.name),
    )
    .filter((outputPath) => !existsSync(outputPath));
}

function buildMissingOutputRetryGuidance(): string {
  return `Create the missing output files at the paths above, then rerun the same ${getRuntimeScriptPath("send_report.sh")} command.`;
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
    next?: unknown;
    message?: unknown;
    artifacts?: unknown;
  } | null;

  if (!body || !isAgentId(body.fromAgent)) {
    return Response.json({ error: "Invalid fromAgent" }, { status: 400 });
  }
  if (typeof body.taskId !== "string" || !body.taskId.trim()) {
    return Response.json({ error: "Missing taskId" }, { status: 400 });
  }
  if (typeof body.next !== "string" || !body.next.trim()) {
    return Response.json({ error: "Missing next" }, { status: 400 });
  }
  if (typeof body.message !== "string" || !body.message.trim()) {
    return Response.json({ error: "Missing message" }, { status: 400 });
  }

  try {
    const taskId = body.taskId.trim();
    const next = body.next.trim();
    const message = body.message.trim();
    const summary = summarizeMessage(message);
    const reportStatus = deriveReportStatus(next);
    const taskStatus = deriveTaskStatus(next);
    const artifacts = Array.isArray(body.artifacts)
      ? body.artifacts.filter((item): item is string => typeof item === "string")
      : [];

    const operationState = getOperationState(missionId);
    let workflowGuidance: string | undefined;
    let autoDispatch:
      | { agentId: WorkerAgentId; stepName: string; taskId: string; sessionId: string }
      | undefined;
    let nextStep: string | null = null;

    if (body.fromAgent === "noctis" && !operationState) {
      return Response.json({ error: "No active workflow step for Noctis report" }, { status: 409 });
    }

    if (operationState && (operationState.status === "running" || operationState.status === "waiting_for_report")) {
      const operation = loadOperationByRef(getOperationRef(operationState));
      const currentStep = operation.steps.find((step) => step.name === operationState.currentStep);
      const latestStep = operationState.stepHistory.at(-1);
      const delegatedTask = getDelegatedTaskRecord(operationState, taskId);
      const isDelegatedChildReport =
        !!currentStep &&
        currentStep.agent === "noctis" &&
        hasDelegationPolicy(currentStep) &&
        !!delegatedTask &&
        delegatedTask.parentStep === currentStep.name;

      if (isDelegatedChildReport) {
        if (delegatedTask.agent !== body.fromAgent) {
          return Response.json(
            {
              error: `Delegated task expects reports from ${delegatedTask.agent}`,
              currentStep: currentStep?.name ?? null,
            },
            { status: 409 },
          );
        }

        if (delegatedTask.status !== "dispatched") {
          return Response.json(
            {
              error: "Unexpected taskId for the active delegated child task",
              taskId,
            },
            { status: 409 },
          );
        }

        if (next !== "COMPLETE" && next !== "ABORT") {
          return Response.json(
            {
              error: "Invalid next",
              allowedNext: [
                { next: "COMPLETE", condition: "Delegated child task succeeded" },
                { next: "ABORT", condition: "Delegated child task failed or was blocked" },
              ],
            },
            { status: 400 },
          );
        }

        const reportResult = operationInstantiator.processStepReport({
          missionId,
          reportBody: message,
          fromAgent: body.fromAgent,
          taskId,
          next,
        });

        workflowGuidance = reportResult.noctisGuidance || undefined;
        nextStep = reportResult.nextStep?.name ?? currentStep.name;
      } else {

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

        if (currentStep && currentStep.rules.length > 0) {
          const allowedNextValues = listAllowedNextValues(currentStep.rules);
          if (!allowedNextValues.includes(next)) {
            return Response.json(
              {
                error: "Invalid next",
                allowedNext: currentStep.rules.map((rule) => ({
                  next: rule.next,
                  condition: rule.condition,
                })),
              },
              { status: 400 },
            );
          }
        }

        if (currentStep?.output_contracts?.report.length) {
          const missingOutputs = listMissingRequiredOutputs({
            missionId,
            stepName: currentStep.name,
            taskId,
            reports: currentStep.output_contracts.report,
          });
          if (missingOutputs.length > 0) {
            return Response.json(
              {
                error: "Missing required output files",
                missingOutputs,
                retryGuidance: buildMissingOutputRetryGuidance(),
              },
              { status: 400 },
            );
          }
        }

        const reportResult = operationInstantiator.processStepReport({
          missionId,
          reportBody: message,
          fromAgent: body.fromAgent,
          taskId,
          next,
        });

        workflowGuidance = reportResult.noctisGuidance || undefined;
        nextStep = reportResult.stateTransition?.nextStep ?? null;

        if (reportResult.nextWorkerDispatch) {
          try {
            const dispatched = await dispatchCurrentOperationStepToWorker({
              missionId,
              fromAgent: body.fromAgent,
              orchestratedBy: "noctis",
              canonicalMessage: message,
            });
            autoDispatch = {
              agentId: dispatched.agentId,
              stepName: dispatched.stepName,
              taskId: dispatched.taskId,
              sessionId: dispatched.sessionId,
            };
          } catch (error) {
            const dispatchError = error instanceof Error ? error.message : String(error);

            if (body.fromAgent === "noctis") {
              return Response.json(
                {
                  error: `Automatic dispatch failed: ${dispatchError}`,
                  nextStep,
                },
                { status: 503 },
              );
            }

            workflowGuidance = joinXmlSections([
              buildTextSection("operation-note", `Automatic handoff failed: ${dispatchError}`),
              workflowGuidance ?? null,
            ]);
          }
        }
      }
    }

    const result: StepResult = {
      task_id: taskId,
      next,
      message,
      artifacts,
      ...(summary ? { summary } : {}),
      reportStatus,
    };

    if (body.fromAgent !== "noctis") {
      updateTask(missionId, taskId, taskStatus, summary, result);
    }

    if (autoDispatch) {
      return Response.json({
        dispatchedTo: autoDispatch.agentId,
        nextStep: autoDispatch.stepName,
        taskId: autoDispatch.taskId,
        sessionId: autoDispatch.sessionId,
      });
    }

    if (body.fromAgent === "noctis") {
      return Response.json({
        acknowledged: true,
        nextStep,
        currentStep: operationState?.currentStep ?? null,
      });
    }

    const delivery = await sendWorkerReport({
      missionId,
      fromAgent: body.fromAgent,
      taskId,
      next,
      message,
      reportStatus,
      artifacts,
      workflowGuidance,
    });

    return Response.json(delivery);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send report";
    const status = message === "Mission not found" ? 404 : 503;
    return Response.json({ error: message }, { status });
  }
};