import type { BanterCue } from "@/lib/banter/types";

export type WorkerAgentId = "ignis" | "gladiolus" | "prompto";
export type AgentId = "noctis" | "lunafreya" | WorkerAgentId;
export type ActivityActorId = AgentId | "user" | "iris" | "system";
export type TeamMessageType = "task" | "report" | "message";
export type ReportStatus = "running" | "blocked" | "completed" | "failed";
export type WorkflowNext = string;
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
  variant?: string;
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
  windowTokens: number;
}

export type MissionStatus = "active" | "completed" | "archived";

export type MissionWorkspaceStatus = "ready" | "missing" | "deleted";

export type MissionExecutionTargetMode = "mission_workspace" | "execution_project";

export type MissionTransportMode = "app-owned" | "tmux-resident";

export type MissionResumeBlockCode = "missing_execution_project" | "unsupported_mission_runtime";

export type MissionSurfaceId = "noctis_team" | "lunafreya";

export type MissionPrimaryAgentId = "noctis" | "lunafreya";

export interface LunafreyaFacetSelection {
  selectedJobId?: string;
  selectedSkillIds: string[];
  updatedAt: string;
}

export interface LunafreyaFacetSnapshot extends LunafreyaFacetSelection {
  selectedJobLabel?: string | null;
  selectedSkillLabels: string[];
}

export interface MissionOutputMetadata {
  capturedAt: string;
  lunafreyaFacetSnapshot?: LunafreyaFacetSnapshot;
}

export interface StepResult {
  task_id: string;
  next: WorkflowNext;
  message: string;
  artifacts: string[];
  summary?: string;
  reportStatus?: ReportStatus;
}

export type WorkerResult = StepResult;

export type TaskStatus = "pending" | "running" | "blocked" | "completed" | "failed";

export interface Task {
  id: string;
  assignedTo: WorkerAgentId;
  dependencies: string[];
  status: TaskStatus;
  message: string;
  result?: StepResult;
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
  schemaVersion?: number;
  noctisSessionId: string;
  transportMode?: MissionTransportMode;
  surfaceId?: MissionSurfaceId;
  primaryAgentId?: MissionPrimaryAgentId;
  primarySessionId?: string;
  sessionOwners?: Record<string, AgentId>;
  workerSessions: Partial<Record<WorkerAgentId, string>>;
  executionProjectId?: string;
  executionTargetMode?: MissionExecutionTargetMode;
  contextProjectIds: string[];
  baseBranch?: string;
  branch?: string;
  workspacePath?: string;
  workspaceStatus?: MissionWorkspaceStatus;
  allowedWorkers: WorkerAgentId[];
  taskGraph: Task[];
  delegationLedger: DelegationLedger;
  agentModels: Partial<Record<AgentId, ModelSelection>>;
  createdAt: string;
  updatedAt: string;
  latestPrimaryMessageId?: string;
  latestPrimaryMessageCreatedAt?: string;
  archivedAt?: string;
  title: string;
  objective?: string;
  status: MissionStatus;
  conversationLog: ConversationLogEntry[];
  ambientBanterLog: AmbientBanterEntry[];
  messageLog: MissionMessageLogEntry[];
  activityLog: MissionActivityLogEntry[];
  operationState?: OperationState;
  lunafreyaFacetSelection?: LunafreyaFacetSelection;
  outputMetadataByKey?: Record<string, MissionOutputMetadata>;
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

export type DelegatedTaskStatus = "dispatched" | "completed" | "failed";

export interface DelegatedTaskRecord {
  parentStep: string;
  taskId: string;
  agent: WorkerAgentId;
  status: DelegatedTaskStatus;
  createdAt: string;
  completedAt?: string;
  message?: string;
  summary?: string;
}

export type StepHistoryStatus = "dispatched" | "completed" | "failed";

export interface StepHistoryEntry {
  step: string;
  agent: AgentId;
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
  operationRef: string;
  currentStep: string;
  iteration: number;
  status: OperationStatus;
  activatedAt: string;
  updatedAt: string;
  reportDir: string;
  stepHistory: StepHistoryEntry[];
  delegatedTasks: DelegatedTaskRecord[];
  deviations: DeviationTracker;
}

export interface MissionWorkflowProgress {
  workflowLabel: string;
  currentStep: string;
  currentStepIndex: number;
  totalSteps: number;
  status: OperationStatus;
  updatedAt: string;
  visitCount: number;
  isTerminal: boolean;
}

export interface MissionActivitySource {
  type: "session_message" | "team_message" | "system";
  sessionId?: string;
  messageId?: string;
  taskId?: string;
  next?: WorkflowNext;
  reportStatus?: ReportStatus;
  deliveryStatus?: "queued" | "sent" | "failed";
  lunafreyaFacetSnapshot?: LunafreyaFacetSnapshot;
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

export interface BanterEntryPayload {
  artifacts?: string[];
  body?: string;
  canonicalMessage?: string;
  next?: WorkflowNext;
  reportBody?: string;
  reportStatus?: ReportStatus;
  sourceEvent?: string;
  stepName?: string;
  taskId?: string;
}

export interface BanterTransport {
  deliveredToSessionId?: string;
  deliveryStatus?: "queued" | "sent" | "failed";
  error?: string;
  sessionId?: string;
}

export interface BanterTimelineEntryBase {
  id: string;
  missionId: string;
  kind: "directed" | "ambient";
  speakerAgent: AgentId;
  cue: BanterCue;
  renderedMessage: string;
  createdAt: string;
  payload?: BanterEntryPayload;
  transport?: BanterTransport;
}

export interface ConversationLogEntry extends BanterTimelineEntryBase {
  kind: "directed";
  fromAgent: AgentId;
  toAgent: AgentId;
  orchestratedBy: AgentId;
  stepName?: string;
  taskId?: string;
}

export interface AmbientBanterEntry extends BanterTimelineEntryBase {
  kind: "ambient";
}

export type BanterTimelineEntry = ConversationLogEntry | AmbientBanterEntry;

export interface TeamMessage {
  id: string;
  missionId: string;
  fromAgent: AgentId;
  toAgent: AgentId;
  type: TeamMessageType;
  body: string;
  taskId?: string;
  next?: WorkflowNext;
  reportStatus?: ReportStatus;
  artifacts?: string[];
  createdAt: string;
}

export interface MissionMessageLogEntry extends TeamMessage {
  deliveredToSessionId: string;
  deliveryStatus: "queued" | "sent" | "failed";
  error?: string;
}

export interface MissionSummary {
  missionId: string;
  title: string;
  objective?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  status: MissionStatus;
  activitySessionIds: string[];
  primarySessionId?: string | null;
  agentStatuses?: Partial<Record<AgentId, import("@/lib/session-status").SessionStatus>>;
  latestPrimaryMessageId?: string | null;
  latestPrimaryMessageCreatedAt?: string | null;
}

export interface MissionOutputSummary {
  step: string;
  taskId: string;
  filename: string;
  title: string;
  author: string;
  date: string;
  filePath: string;
  tags: string[];
  metadata?: MissionOutputMetadata | null;
}

export interface MissionOutputDocument extends MissionOutputSummary {
  content: string;
  displayMode: import("@/lib/types/markdown-document").MarkdownDocumentDisplayMode;
  frontmatter: import("@/lib/types/markdown-document").MarkdownDocumentFrontmatter | null;
  rawContent: string;
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
      ? dependencyResults.map((r) => `${r.task_id}: ${r.summary ?? r.message}`).join("\n")
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
- Step results return to runtime through scripts/send_report.sh
- The report must include the same taskId: ${taskId}
- A task is complete only after runtime accepts the report for ${taskId}
- Do not stop after printing JSON in chat

[OUTPUT FORMAT]
Return results in StepResult format: { task_id, next, message, artifacts }

[MANDATORY DELIVERY]
- Use scripts/send_report.sh to send your result back to runtime
- Use one next value plus one quoted message payload
- Include the same taskId in the report command

[EXPECTED OUTPUT]
${outputSchema}`;
}
