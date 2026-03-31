import type { OperationState, ReportStatus, WorkerAgentId } from "@/lib/types/mission";

export type { OperationState };

export interface StateTransition {
  previousMovement: string;
  nextMovement: string;
  ruleMatched: number;
  ruleCondition: string;
}

export interface ProcessCrystalMessageInput {
  missionId: string;
  sessionId: string;
  message: string;
  isNewMission: boolean;
  selectedOperation?: string | null;
}

export interface ProcessCrystalMessageResult {
  additionalContext: string | null;
  operationActivated?: string;
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