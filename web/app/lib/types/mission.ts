export type WorkerAgentId = "ignis" | "gladiolus" | "prompto";
export type AgentId = "noctis" | WorkerAgentId;

export interface ModelSelection {
  providerID: string;
  modelID: string;
}

export interface WorkerResult {
  task_id: string;
  status: "completed" | "failed";
  summary: string;
  artifacts: string[];
}

export type TaskStatus = "pending" | "running" | "completed" | "failed";

export interface Task {
  id: string;
  assignedTo: WorkerAgentId;
  dependencies: string[];
  status: TaskStatus;
  message: string;
  result?: WorkerResult;
}

export interface DelegationLedger {
  missionId: string;
  activeTasks: Array<Pick<Task, "id" | "assignedTo" | "status">>;
  completedSummaries: Record<string, string>;
}

export interface AgentRuntime {
  agentId: AgentId;
  sessionId: string;
  missionId: string;
  status: "idle" | "working" | "success" | "blocked";
  currentTask?: string;
}

export interface Mission {
  id: string;
  noctisSessionId: string;
  workerSessions: Partial<Record<WorkerAgentId, string>>;
  taskGraph: Task[];
  delegationLedger: DelegationLedger;
  agentModels: Partial<Record<AgentId, ModelSelection>>;
}

export interface TaskContextParams {
  missionId: string;
  missionObjective: string;
  taskId: string;
  taskInstruction: string;
  dependencyResults: WorkerResult[];
  outputSchema: string;
}

export function buildTaskContext(params: TaskContextParams): string {
  const {
    missionId,
    missionObjective,
    taskId,
    taskInstruction,
    dependencyResults,
    outputSchema,
  } = params;

  const depSection =
    dependencyResults.length > 0
      ? dependencyResults.map((r) => `${r.task_id}: ${r.summary}`).join("\n")
      : "(none)";

  return `[GLOBAL CONTEXT]
Mission: ${missionId}
Objective: ${missionObjective}

[TASK]
Task ID: ${taskId}
Instruction: ${taskInstruction}

[DEPENDENCIES]
${depSection}

[CONSTRAINTS]
- No new external dependencies
- Return results in WorkerResult format: { task_id, status, summary, artifacts }

[EXPECTED OUTPUT]
${outputSchema}`;
}
