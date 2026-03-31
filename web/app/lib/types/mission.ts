export type WorkerAgentId = "ignis" | "gladiolus" | "prompto";
export type AgentId = "noctis" | WorkerAgentId;
export type ActivityActorId = AgentId | "user" | "iris" | "system";
export type TeamMessageType = "task" | "report" | "message";
export type ReportStatus = "running" | "blocked" | "completed" | "failed";
export type MissionActivityKind =
  | "user_message"
  | "assistant_message"
  | "team_message"
  | "system_event"
  | "agent_proxy_quote"
  | "iris_observation";

export interface ModelSelection {
  providerID: string;
  modelID: string;
}

export interface AgentContextUsage {
  calculatedAt: string;
  limitTokens: number;
  modelID: string;
  providerID: string;
  remainingPercentage: number;
  remainingTokens: number;
  tokenBreakdown: {
    cacheRead: number;
    cacheWrite: number;
    input: number;
    output: number;
    reasoning: number;
    total: number;
  };
  usedPercentage: number;
  usedTokens: number;
}

export type MissionStatus = "active" | "completed" | "archived";

export interface WorkerResult {
  task_id: string;
  status: ReportStatus;
  summary: string;
  artifacts: string[];
  ruleIndex?: number;
}

export type TaskStatus = "pending" | "running" | "blocked" | "completed" | "failed";

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
  archivedAt?: string;
  title: string;
  objective?: string;
  status: MissionStatus;
  messageLog: MissionMessageLogEntry[];
  activityLog: MissionActivityLogEntry[];
  operationState?: OperationState;
}

export type OperationStatus = "running" | "waiting_for_report" | "complete" | "aborted";

export type DeviationType = "agent_mismatch" | "step_skip" | "order_deviation";

export interface DeviationEntry {
  type: DeviationType;
  expected: string;
  actual: string;
  timestamp: string;
}

export interface DeviationTracker {
  totalDeviations: number;
  history: DeviationEntry[];
}

export type StepHistoryStatus = "dispatched" | "completed" | "failed";

export interface StepHistoryEntry {
  step: string;
  agent: string;
  taskId?: string;
  status: StepHistoryStatus;
  ruleMatched?: number;
  ruleCondition?: string;
  nextStep?: string;
  dispatchedAt: string;
  completedAt?: string;
  summary?: string;
}

export interface OperationState {
  operationName: string;
  currentStep: string;
  iteration: number;
  status: OperationStatus;
  activatedAt: string;
  updatedAt: string;
  reportDir: string;
  previousResponse: string | null;
  stepHistory: StepHistoryEntry[];
  deviations: DeviationTracker;
}

export interface MissionActivitySource {
  type: "session_message" | "team_message" | "system";
  sessionId?: string;
  messageId?: string;
  taskId?: string;
  reportStatus?: ReportStatus;
  ruleIndex?: number;
  deliveryStatus?: "sent" | "failed";
}

export interface MissionActivityLogEntry {
  id: string;
  missionId: string;
  actor: ActivityActorId;
  speaker: ActivityActorId;
  kind: MissionActivityKind;
  body: string;
  createdAt: string;
  source?: MissionActivitySource;
}

export interface TeamMessage {
  id: string;
  missionId: string;
  fromAgent: AgentId;
  toAgent: AgentId;
  type: TeamMessageType;
  body: string;
  taskId?: string;
  reportStatus?: ReportStatus;
  ruleIndex?: number;
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
  archivedAt?: string;
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
  const { missionId, missionObjective, taskId, taskInstruction, dependencyResults, outputSchema } =
    params;

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
- Workers return to Noctis only through scripts/send_report.sh
- The report must include the same taskId: ${taskId}
- A task is complete only after Noctis receives the report for ${taskId}
- Do not stop after printing JSON in chat

[OUTPUT FORMAT]
Return results in WorkerResult format: { task_id, status, summary, artifacts }

[MANDATORY DELIVERY]
- Use scripts/send_report.sh to send your result back to Noctis
- Use status=running for progress, status=blocked for blockers, status=completed for final success, status=failed for final failure
- Include the same taskId in the report command

[EXPECTED OUTPUT]
${outputSchema}`;
}
