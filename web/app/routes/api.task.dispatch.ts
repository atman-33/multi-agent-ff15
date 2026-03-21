import type { Route } from "./+types/api.task.dispatch";
import { getOpencodeClient } from "@/lib/opencode-client";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { buildInjectedPromptContext } from "@/lib/prompt-context.server";
import {
  addTask,
  getMission,
  setWorkerSession,
  updateTask,
  buildDelegationLedger,
} from "@/lib/mission-store";
import { buildTaskContext } from "@/lib/types/mission";
import type { Task, WorkerAgentId } from "@/lib/types/mission";

const WORKER_AGENT_IDS: ReadonlySet<string> = new Set<WorkerAgentId>([
  "ignis",
  "gladiolus",
  "prompto",
]);

function isWorkerAgentId(value: unknown): value is WorkerAgentId {
  return typeof value === "string" && WORKER_AGENT_IDS.has(value);
}

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json().catch(() => null) as {
    missionId?: unknown;
    agentId?: unknown;
    taskId?: unknown;
    message?: unknown;
    missionObjective?: unknown;
    outputSchema?: unknown;
  } | null;

  if (!body) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body.missionId !== "string" || !body.missionId.trim()) {
    return Response.json({ error: "Missing missionId" }, { status: 400 });
  }
  if (!isWorkerAgentId(body.agentId)) {
    return Response.json({ error: "Invalid agentId" }, { status: 400 });
  }
  if (typeof body.taskId !== "string" || !body.taskId.trim()) {
    return Response.json({ error: "Missing taskId" }, { status: 400 });
  }
  if (typeof body.message !== "string" || !body.message.trim()) {
    return Response.json({ error: "Missing message" }, { status: 400 });
  }

  const missionId = body.missionId.trim();
  const agentId = body.agentId;
  const taskId = body.taskId.trim();
  const message = body.message.trim();
  const missionObjective = typeof body.missionObjective === "string" ? body.missionObjective : "";
  const outputSchema =
    typeof body.outputSchema === "string" && body.outputSchema.trim()
      ? body.outputSchema.trim()
      : "WorkerResult JSON delivered to Noctis via send-team-message report/update";

  const mission = getMission(missionId);
  if (!mission) {
    return Response.json({ error: "Mission not found" }, { status: 404 });
  }

  let task = mission.taskGraph.find((t) => t.id === taskId);
  if (!task) {
    const nextTask: Task = {
      id: taskId,
      assignedTo: agentId,
      dependencies: [],
      status: "pending",
      message,
    };
    addTask(missionId, nextTask);
    task = nextTask;
  }

  const completedDepResults = (task?.dependencies ?? [])
    .map((depId) => {
      const summary = mission.delegationLedger.completedSummaries[depId];
      return summary
        ? { task_id: depId, status: "completed" as const, summary, artifacts: [] }
        : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const trackedReplyContract = [
    "[TRACKED REPLY CONTRACT]",
    "- This dispatch is a tracked task request.",
    "- Chat output is not completion.",
    "- Use send-team-message skill to respond via report/update.",
    `- taskId is mandatory and must match exactly: ${taskId}`,
    "- Task completes only when Noctis receives that tracked reply.",
  ].join("\n");

  const taskPrompt = buildTaskContext({
    missionId,
    missionObjective,
    taskId,
    taskInstruction: `${message}\n\n${trackedReplyContract}`,
    dependencyResults: completedDepResults,
    outputSchema,
  });

  try {
    const client = getOpencodeClient();
    const projectRoot = getProjectRoot();

    const existingSessionId = mission.workerSessions[agentId];

    if (existingSessionId) {
      const workerModel = mission.agentModels[agentId];
      const promptResult = await client.session.promptAsync({
        path: { id: existingSessionId },
        body: {
          parts: [{ type: "text", text: taskPrompt }],
          agent: agentId,
          ...(workerModel ? { model: workerModel } : {}),
        },
      });

      if (promptResult.error) {
        return Response.json({ error: promptResult.error }, { status: 502 });
      }

      updateTask(missionId, taskId, "running");
      return Response.json({ sessionId: existingSessionId });
    }

    const ledger = buildDelegationLedger(mission);
    const sessionResult = await client.session.create({
      query: { directory: projectRoot },
      body: { title: `mission:${missionId}:${agentId}` },
    });

    if (sessionResult.error) {
      return Response.json({ error: sessionResult.error }, { status: 502 });
    }

    const sessionId = sessionResult.data?.id;
    if (!sessionId) {
      return Response.json({ error: "Session creation returned no ID" }, { status: 502 });
    }

    setWorkerSession(missionId, agentId, sessionId);

    const injectedContext = buildInjectedPromptContext({
      missionId,
      sessionId,
      agent: agentId,
      appRoot: projectRoot,
    });

    const promptResult = await client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: [
          { type: "text", text: injectedContext },
          { type: "text", text: taskPrompt },
        ],
        agent: agentId,
        system: ledger,
        ...(mission.agentModels[agentId] ? { model: mission.agentModels[agentId] } : {}),
      },
    });

    if (promptResult.error) {
      return Response.json({ error: promptResult.error }, { status: 502 });
    }

    updateTask(missionId, taskId, "running");
    return Response.json({ sessionId });
  } catch {
    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};
