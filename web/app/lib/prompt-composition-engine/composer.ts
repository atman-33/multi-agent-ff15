import { buildPromptPayloadParts, type PromptPart, type TextPromptPart } from "@/lib/prompt-parts";
import { buildRoutedMessageEnvelope, buildTeamMessageEnvelope } from "@/lib/team-message-format";
import type { ActivityActorId, AgentId, ReportStatus, TeamMessageType, WorkerAgentId } from "@/lib/types/mission";
import type { OperationState, StateTransition } from "@/lib/operation-runtime/types";
import { buildSharedPromptContext, type BuildSharedPromptContextOptions } from "./common-context.server";
import {
  composeReportWorkflowExtension,
  composeUserWorkflowExtension,
  composeWorkerWorkflowPrompt,
} from "./workflow-extension";

export interface ComposedPromptPayload {
  sharedContext: string;
  promptBody: string;
  workflowExtension: string | null;
  effectivePrompt: string;
  payloadParts: TextPromptPart[];
}

function composePayload(input: {
  context: BuildSharedPromptContextOptions;
  promptBody: string;
  workflowExtension?: string | null;
}): ComposedPromptPayload {
  const sharedContext = buildSharedPromptContext(input.context);
  const workflowExtension = input.workflowExtension?.trim() || null;
  const effectivePrompt = workflowExtension
    ? `${workflowExtension}\n\n${input.promptBody}`
    : input.promptBody;

  return {
    sharedContext,
    promptBody: input.promptBody,
    workflowExtension,
    effectivePrompt,
    payloadParts: buildPromptPayloadParts(sharedContext, [{ type: "text", text: effectivePrompt }]),
  };
}

export function composeGenericSessionPrompt(input: {
  context: BuildSharedPromptContextOptions;
  parts: PromptPart[];
}): { sharedContext: string; payloadParts: TextPromptPart[] } {
  const sharedContext = buildSharedPromptContext(input.context);
  return {
    sharedContext,
    payloadParts: buildPromptPayloadParts(sharedContext, input.parts),
  };
}

export function composeUserToNoctisPrompt(input: {
  context: BuildSharedPromptContextOptions;
  userMessage: string;
  missionId: string;
  sessionId: string;
  isNewMission: boolean;
  selectedOperation?: string | null;
  lastNoctisResponse?: string;
}): ComposedPromptPayload & {
  operationActivated?: string;
  stateTransition?: StateTransition;
} {
  const workflow = composeUserWorkflowExtension({
    missionId: input.missionId,
    sessionId: input.sessionId,
    message: input.userMessage,
    isNewMission: input.isNewMission,
    selectedOperation: input.selectedOperation,
    lastNoctisResponse: input.lastNoctisResponse,
  });

  const promptBody = buildRoutedMessageEnvelope({
    speaker: "user",
    to: "noctis",
    messageType: "chat",
    body: input.userMessage,
  });

  return {
    ...composePayload({
      context: input.context,
      promptBody,
      workflowExtension: workflow.additionalContext,
    }),
    operationActivated: workflow.operationActivated,
    stateTransition: workflow.stateTransition,
  };
}

export function composeWorkerTaskPrompt(input: {
  context: BuildSharedPromptContextOptions;
  missionId: string;
  agentId: WorkerAgentId;
  originalPrompt: string;
  operationStateOverride?: OperationState;
}): ComposedPromptPayload & { usedWorkflowExtension: boolean } {
  const workflow = composeWorkerWorkflowPrompt({
    missionId: input.missionId,
    originalPrompt: input.originalPrompt,
    agentId: input.agentId,
    operationStateOverride: input.operationStateOverride,
  });

  return {
    ...composePayload({
      context: input.context,
      promptBody: workflow.promptText,
      workflowExtension: workflow.usedWorkflowExtension ? workflow.promptText : null,
    }),
    usedWorkflowExtension: workflow.usedWorkflowExtension,
  };
}

export function composeTeamMessagePrompt(input: {
  context: BuildSharedPromptContextOptions;
  missionId: string;
  from: ActivityActorId;
  to: AgentId;
  type: TeamMessageType;
  body: string;
  details?: string;
  taskId?: string;
  reportStatus?: ReportStatus;
  artifacts?: string[];
  operationStateOverride?: OperationState;
}): ComposedPromptPayload & { stateTransition: StateTransition | null } {
  const promptBody = buildTeamMessageEnvelope({
    from: input.from,
    to: input.to,
    type: input.type,
    body: input.body,
    taskId: input.taskId,
    reportStatus: input.reportStatus,
    artifacts: input.artifacts,
    details: input.details,
  });

  const workflow =
    input.type === "report" && input.to === "noctis" && input.taskId && input.reportStatus
      ? composeReportWorkflowExtension({
          missionId: input.missionId,
          reportBody: input.body,
          reportDetails: input.details,
          fromAgent: input.from as WorkerAgentId,
          taskId: input.taskId,
          reportStatus: input.reportStatus,
          operationStateOverride: input.operationStateOverride,
        })
      : { noctisGuidance: "", stateTransition: null };

  return {
    ...composePayload({
      context: input.context,
      promptBody,
      workflowExtension: workflow.noctisGuidance,
    }),
    stateTransition: workflow.stateTransition,
  };
}

export function composePromptPreview(input: {
  context: BuildSharedPromptContextOptions;
  promptBody: string;
  workflowExtension?: string | null;
}): ComposedPromptPayload {
  return composePayload(input);
}