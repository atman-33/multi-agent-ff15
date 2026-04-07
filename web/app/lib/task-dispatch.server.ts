import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  addTask,
  appendMissionMessage,
  buildDelegationLedger,
  getMission,
  setWorkerSession,
  updateTask,
} from "@/lib/mission-store";
import { splitModelSelection } from "@/lib/model-variant-selection";
import { getOpencodeClient } from "@/lib/opencode-client";
import { loadOperationByRef } from "@/lib/operation-definition/operation-catalog";
import { hasDelegationPolicy, resolveEffectiveDelegationWorkers } from "@/lib/operation-runtime/autonomous";
import {
  completeDelegatedTask,
  ensureActiveStepTaskId,
  getOperationRef,
  getOperationState,
  registerDelegatedTask,
  saveOperationState,
} from "@/lib/operation-runtime/state";
import { composeWorkerTaskPrompt } from "@/lib/prompt-composition-engine";
import type { MissionMessageLogEntry, Task, WorkerAgentId } from "@/lib/types/mission";

function createTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return String(error);
}

function buildCompactTaskPrompt(input: {
  taskId: string;
  missionObjective: string;
  instruction: string;
  dependencies: Array<{ task_id: string; summary: string }>;
  missionId: string;
  agentId: WorkerAgentId;
}): string {
  const lines = [`Task ID: ${input.taskId}`, `Task: ${input.instruction}`];

  if (input.missionObjective.trim()) {
    lines.push(`Mission: ${input.missionObjective.trim()}`);
  }

  if (input.dependencies.length > 0) {
    lines.push("Dependencies:");
    for (const dependency of input.dependencies) {
      lines.push(`- ${dependency.task_id}: ${dependency.summary}`);
    }
  }

  lines.push("");
  lines.push("Reply:");
  lines.push("- Use the bash tool to run send_report.sh.");
  lines.push("- Do not print the command in chat. Run it with the bash tool.");
  lines.push("- send_report.sh returns the step result to runtime; runtime decides the next actor.");
  lines.push("- If the workflow prompt includes <step-completion-contract>, follow its allowed next values exactly.");
  lines.push("- If no workflow-specific next values are provided, use COMPLETE for success and ABORT for failure.");
  lines.push(
    `- Success example: scripts/send_report.sh ${input.missionId} ${input.agentId} ${input.taskId} COMPLETE "<message>"`
  );
  lines.push(
    `- Failure example: scripts/send_report.sh ${input.missionId} ${input.agentId} ${input.taskId} ABORT "<message>"`
  );

  return lines.join("\n");
}

export async function dispatchCurrentOperationStepToWorker(input: {
  missionId: string;
}): Promise<{ sessionId: string; taskId: string; stepName: string; agentId: WorkerAgentId }> {
  const operationState = getOperationState(input.missionId);
  if (!operationState) {
    throw new Error("Operation state not found");
  }

  const operation = loadOperationByRef(getOperationRef(operationState));
  const currentStep = operation.steps.find((step) => step.name === operationState.currentStep);
  if (!currentStep) {
    throw new Error("Operation step not found");
  }
  if (currentStep.agent === "noctis") {
    throw new Error("Current step is assigned to Noctis");
  }

  const mission = getMission(input.missionId);
  const taskId = ensureActiveStepTaskId(operationState, currentStep.agent);
  const result = await dispatchTaskToWorker({
    missionId: input.missionId,
    agentId: currentStep.agent,
    message: `Execute the active operation step "${currentStep.name}" for operation "${operation.name}".`,
    taskId,
    missionObjective: mission?.objective,
  });

  return {
    ...result,
    stepName: currentStep.name,
    agentId: currentStep.agent,
  };
}

export async function dispatchTaskToWorker(input: {
  missionId: string;
  agentId: WorkerAgentId;
  message: string;
  taskId?: string;
  missionObjective?: string;
  outputSchema?: string;
}): Promise<{ sessionId: string; taskId: string }> {
  const mission = getMission(input.missionId);
  if (!mission) {
    throw new Error("Mission not found");
  }

  const explicitTaskId = input.taskId?.trim();
  const operationState = getOperationState(input.missionId);
  const operation = operationState
    ? loadOperationByRef(getOperationRef(operationState))
    : null;
  const currentStep = operation?.steps.find((step) => step.name === operationState?.currentStep);
  const isDelegatedChildDispatch =
    !explicitTaskId && !!currentStep && currentStep.agent === "noctis" && hasDelegationPolicy(currentStep);

  if (isDelegatedChildDispatch && currentStep) {
    const effectiveWorkers = resolveEffectiveDelegationWorkers({
      missionId: input.missionId,
      step: currentStep,
    });
    if (!effectiveWorkers.includes(input.agentId)) {
      throw new Error(`Delegation to ${input.agentId} is not allowed for the active step`);
    }
  }

  const reusableTask = explicitTaskId
    ? null
    : isDelegatedChildDispatch
      ? null
    : ([...mission.taskGraph]
        .reverse()
        .find(
          (task) =>
            task.assignedTo === input.agentId &&
            (task.status === "pending" || task.status === "running")
        ) ?? null);
  const taskId = explicitTaskId || reusableTask?.id || createTaskId();
  const missionObjective = typeof input.missionObjective === "string" ? input.missionObjective : "";

  if (isDelegatedChildDispatch && currentStep && operationState) {
    registerDelegatedTask(operationState, {
      parentStep: currentStep.name,
      taskId,
      agent: input.agentId,
      message: input.message,
    });
    saveOperationState(input.missionId, operationState);
  }

  let task = mission.taskGraph.find((item) => item.id === taskId);
  if (!task) {
    const nextTask: Task = {
      id: taskId,
      assignedTo: input.agentId,
      dependencies: [],
      status: "pending",
      message: input.message,
    };
    addTask(input.missionId, nextTask);
    task = nextTask;
  }

  const completedDepResults = (task.dependencies ?? [])
    .map((depId) => {
      const summary = mission.delegationLedger.completedSummaries[depId];
      return summary
        ? { task_id: depId, next: "COMPLETE", message: summary, summary, artifacts: [] }
        : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const taskPrompt = buildCompactTaskPrompt({
    taskId,
    missionObjective,
    instruction: input.message,
    dependencies: completedDepResults,
    missionId: input.missionId,
    agentId: input.agentId,
  });

  const client = getOpencodeClient();
  const projectRoot = getProjectRoot();
  const existingSessionId = mission.workerSessions[input.agentId];

  const markDelegatedDispatchFailed = (summary: string) => {
    if (!isDelegatedChildDispatch || !operationState) {
      return;
    }

    completeDelegatedTask(operationState, {
      taskId,
      status: "failed",
      summary,
    });
    saveOperationState(input.missionId, operationState);
  };

  const appendLog = (sessionId: string, deliveryStatus: "sent" | "failed", error?: string) => {
    const entry: MissionMessageLogEntry = {
      id: `msg_${crypto.randomUUID()}`,
      missionId: input.missionId,
      fromAgent: "noctis",
      toAgent: input.agentId,
      type: "task",
      body: input.message,
      taskId,
      createdAt: new Date().toISOString(),
      deliveredToSessionId: sessionId,
      deliveryStatus,
      error,
    };
    appendMissionMessage(input.missionId, entry);
  };

  if (existingSessionId) {
    try {
      const workerModel = mission.agentModels[input.agentId];
      const { model, variant } = splitModelSelection(workerModel);
      const composed = composeWorkerTaskPrompt({
        context: {
          missionId: input.missionId,
          sessionId: existingSessionId,
          agent: input.agentId,
          appRoot: projectRoot,
        },
        missionId: input.missionId,
        agentId: input.agentId,
        taskId,
        originalPrompt: taskPrompt,
        operationStateOverride: operationState,
      });
      const promptResult = await client.session.promptAsync({
        sessionID: existingSessionId,
        parts: composed.payloadParts,
        agent: input.agentId,
        ...(model ? { model } : {}),
        ...(variant ? { variant } : {}),
      });

      if (promptResult.error) {
        const message = toErrorMessage(promptResult.error);
        appendLog(existingSessionId, "failed", message);
        markDelegatedDispatchFailed(message);
        throw new Error(message);
      }

      updateTask(input.missionId, taskId, "running");
      appendLog(existingSessionId, "sent");
      return { sessionId: existingSessionId, taskId };
    } catch (error) {
      appendLog(
        existingSessionId,
        "failed",
        error instanceof Error ? error.message : String(error)
      );
      markDelegatedDispatchFailed(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  const ledger = buildDelegationLedger(mission);
  const sessionResult = await client.session.create({
    directory: projectRoot,
    title: `mission:${input.missionId}:${input.agentId}`,
  });

  if (sessionResult.error) {
    markDelegatedDispatchFailed(toErrorMessage(sessionResult.error));
    throw new Error(toErrorMessage(sessionResult.error));
  }

  const sessionId = sessionResult.data?.id;
  if (!sessionId) {
    markDelegatedDispatchFailed("Session creation returned no ID");
    throw new Error("Session creation returned no ID");
  }

  setWorkerSession(input.missionId, input.agentId, sessionId);

  try {
    const { model, variant } = splitModelSelection(mission.agentModels[input.agentId]);
    const composed = composeWorkerTaskPrompt({
      context: {
        missionId: input.missionId,
        sessionId,
        agent: input.agentId,
        appRoot: projectRoot,
      },
      missionId: input.missionId,
      agentId: input.agentId,
      taskId,
      originalPrompt: taskPrompt,
      operationStateOverride: operationState,
    });
    const promptResult = await client.session.promptAsync({
      sessionID: sessionId,
      parts: composed.payloadParts,
      agent: input.agentId,
      system: ledger,
      ...(model ? { model } : {}),
      ...(variant ? { variant } : {}),
    });

    if (promptResult.error) {
      const message = toErrorMessage(promptResult.error);
      appendLog(sessionId, "failed", message);
      markDelegatedDispatchFailed(message);
      throw new Error(message);
    }

    updateTask(input.missionId, taskId, "running");
    appendLog(sessionId, "sent");
    return { sessionId, taskId };
  } catch (error) {
    appendLog(sessionId, "failed", error instanceof Error ? error.message : String(error));
    markDelegatedDispatchFailed(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
