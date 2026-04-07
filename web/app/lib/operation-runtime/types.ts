import type { AgentId, OperationState, WorkerAgentId, WorkflowNext } from "@/lib/types/mission";

export type { OperationState };

export interface StateTransition {
  previousStep: string;
  nextStep: string;
  ruleMatched: number;
  ruleCondition: string;
}

export interface ProcessUserMessageInput {
  missionId: string;
  sessionId: string;
  message: string;
  isNewMission: boolean;
  selectedOperation?: string | null;
}

export interface ProcessUserMessageResult {
  additionalContext: string | null;
  operationActivated?: string;
  stateTransition?: StateTransition;
}

export interface AugmentTaskPromptInput {
  operationState: OperationState;
  originalPrompt: string;
  agentId: WorkerAgentId;
  missionId: string;
  taskId: string;
}

export interface ProcessReportInput {
  missionId: string;
  operationState: OperationState;
  reportBody: string;
  fromAgent: AgentId;
  taskId: string;
  next?: WorkflowNext;
}

export interface ProcessReportResult {
  noctisGuidance: string;
  stateTransition: StateTransition | null;
  nextWorkerDispatch: { step: string; agentId: WorkerAgentId } | null;
}