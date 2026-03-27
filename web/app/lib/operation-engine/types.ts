import type {
  DeviationEntry,
  DeviationTracker,
  DeviationType,
  MovementHistoryEntry,
  MovementHistoryStatus,
  OperationState,
  OperationStatus,
  ReportStatus,
  WorkerAgentId,
} from "@/lib/types/mission";

export type {
  DeviationEntry,
  DeviationTracker,
  DeviationType,
  MovementHistoryEntry,
  MovementHistoryStatus,
  OperationState,
  OperationStatus,
};

// ---------------------------------------------------------------------------
// Operation Definition (parsed from YAML)
// ---------------------------------------------------------------------------

export interface OperationDefinition {
  sourcePath: string;
  name: string;
  description: string;
  max_movements: number;
  initial_movement: string;
  jobs: Record<string, string>;
  instructions: Record<string, string>;
  knowledge: Record<string, string>;
  policies: Record<string, string>;
  output_contracts: Record<string, string>;
  movements: MovementDefinition[];
}

export type MovementAgent = WorkerAgentId | "noctis";

export interface MovementDefinition {
  name: string;
  agent: MovementAgent;
  job_file: string;
  instruction_file: string;
  knowledge_files?: string[];
  policy_files?: string[];
  edit: boolean;
  pass_previous_response: boolean;
  output_contracts?: {
    report: Array<{ name: string; format_file: string }>;
  };
  rules: RuleDefinition[];
}

export interface RuleDefinition {
  condition: string;
  next: string; // movement name | "COMPLETE" | "ABORT"
}

// ---------------------------------------------------------------------------
// Resolved Facets (loaded file contents)
// ---------------------------------------------------------------------------

export interface ResolvedFacets {
  job: string;
  instruction: string;
  knowledge: string[];
  policies: string[];
  outputContracts: string[];
}

// ---------------------------------------------------------------------------
// Operation State — re-exported from mission.ts
// (canonical definitions live in @/lib/types/mission)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// State Transition
// ---------------------------------------------------------------------------

export interface StateTransition {
  previousMovement: string;
  nextMovement: string; // movement name | "COMPLETE" | "ABORT"
  ruleMatched: number;
  ruleCondition: string;
}

// ---------------------------------------------------------------------------
// Deviation Tracker — re-exported from mission.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Engine Hook Input/Output Types
// ---------------------------------------------------------------------------

export interface ProcessCrystalMessageInput {
  missionId: string;
  sessionId: string;
  message: string;
  isNewMission: boolean;
  selectedOperation?: string | null;
}

export interface ProcessCrystalMessageResult {
  /** Extra text to prepend to the prompt parts sent to Noctis */
  additionalContext: string | null;
  /** Name of an operation that was activated (if any) */
  operationActivated?: string;
  /** State transition from a Noctis self-movement (if any) */
  stateTransition?: StateTransition;
}

export interface AugmentTaskPromptInput {
  operationState: OperationState;
  originalPrompt: string;
  agentId: WorkerAgentId;
  missionId: string;
}

export interface ProcessReportInput {
  operationState: OperationState;
  reportBody: string;
  reportDetails?: string;
  fromAgent: WorkerAgentId;
  taskId: string;
  reportStatus: ReportStatus;
}

export interface ProcessReportResult {
  noctisGuidance: string;
  stateTransition: StateTransition | null;
}
