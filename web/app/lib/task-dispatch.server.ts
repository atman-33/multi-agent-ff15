import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  addTask,
  appendMissionMessage,
  buildDelegationLedger,
  getMission,
  setWorkerSession,
  updateTask,
} from "@/lib/mission-store";
import { getOpencodeClient } from "@/lib/opencode-client";
import { augmentTaskPrompt } from "@/lib/operation-engine/engine";
import { getOperationState } from "@/lib/operation-engine/state";
import { buildInjectedPromptContext } from "@/lib/prompt-context.server";
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
  lines.push(
    `- Final: scripts/send_report.sh ${input.missionId} ${input.agentId} ${input.taskId} completed "<summary>"`
  );
  lines.push(
    `- Blocked: scripts/send_report.sh ${input.missionId} ${input.agentId} ${input.taskId} blocked "<reason>"`
  );

  return lines.join("\n");
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
  const reusableTask = explicitTaskId
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
        ? { task_id: depId, status: "completed" as const, summary, artifacts: [] }
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

  // Hook 2: Operation Engine – augment task prompt with facets
  let effectivePrompt = taskPrompt;
  const operationState = getOperationState(input.missionId);
  if (operationState && (operationState.status === "running" || operationState.status === "waiting_for_report")) {
    effectivePrompt = augmentTaskPrompt({
      operationState,
      originalPrompt: taskPrompt,
      agentId: input.agentId,
      missionId: input.missionId,
    });
  }

  const client = getOpencodeClient();
  const projectRoot = getProjectRoot();
  const existingSessionId = mission.workerSessions[input.agentId];

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
      const promptResult = await client.session.promptAsync({
        path: { id: existingSessionId },
        body: {
          parts: [{ type: "text", text: effectivePrompt }],
          agent: input.agentId,
          ...(workerModel ? { model: workerModel } : {}),
        },
      });

      if (promptResult.error) {
        const message = toErrorMessage(promptResult.error);
        appendLog(existingSessionId, "failed", message);
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
      throw error;
    }
  }

  const ledger = buildDelegationLedger(mission);
  const sessionResult = await client.session.create({
    query: { directory: projectRoot },
    body: { title: `mission:${input.missionId}:${input.agentId}` },
  });

  if (sessionResult.error) {
    throw new Error(toErrorMessage(sessionResult.error));
  }

  const sessionId = sessionResult.data?.id;
  if (!sessionId) {
    throw new Error("Session creation returned no ID");
  }

  setWorkerSession(input.missionId, input.agentId, sessionId);

  const injectedContext = buildInjectedPromptContext({
    missionId: input.missionId,
    sessionId,
    agent: input.agentId,
    appRoot: projectRoot,
  });

  try {
    const promptResult = await client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: [
          { type: "text", text: injectedContext },
          { type: "text", text: effectivePrompt },
        ],
        agent: input.agentId,
        system: ledger,
        ...(mission.agentModels[input.agentId]
          ? { model: mission.agentModels[input.agentId] }
          : {}),
      },
    });

    if (promptResult.error) {
      const message = toErrorMessage(promptResult.error);
      appendLog(sessionId, "failed", message);
      throw new Error(message);
    }

    updateTask(input.missionId, taskId, "running");
    appendLog(sessionId, "sent");
    return { sessionId, taskId };
  } catch (error) {
    appendLog(sessionId, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
