export type WorkerAgentId = "ignis" | "gladiolus" | "prompto";
export type AgentId = "noctis" | WorkerAgentId;
export type TeamMessageType = "instruction" | "notify" | "update" | "report" | "handoff";

export interface ModelSelection {
  providerID: string;
  modelID: string;
}

export type MissionStatus = "active" | "completed" | "archived";

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
  createdAt: string;
  updatedAt: string;
  title: string;
  objective?: string;
  status: MissionStatus;
  messageLog: MissionMessageLogEntry[];
}

export interface TeamMessage {
  id: string;
  missionId: string;
  fromAgent: AgentId;
  toAgent: AgentId;
  type: TeamMessageType;
  body: string;
  taskId?: string;
  artifacts?: string[];
  createdAt: string;
}

export interface MissionMessageLogEntry extends TeamMessage {
  deliveredToSessionId: string;
  deliveryStatus: "sent" | "failed";
  error?: string;
}

export interface MissionSummary {
  missionId: string;
  title: string;
  objective?: string;
  createdAt: string;
  updatedAt: string;
  status: MissionStatus;
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
- Chat output alone is not task completion
- For tracked tasks, use the send-team-message skill to return progress/final results via report or update
- The report/update must include the same taskId: ${taskId}
- A dispatched task is complete only after Noctis receives the tracked report/update for ${taskId}
- Do not stop after printing JSON in chat

[OUTPUT FORMAT]
Return results in WorkerResult format: { task_id, status, summary, artifacts }

[MANDATORY DELIVERY]
- Use the send-team-message skill to send your result back to Noctis
- For final results, use intent=report; for progress updates, use intent=update
- Include the same taskId in that tracked reply

[EXPECTED OUTPUT]
${outputSchema}`;
}
