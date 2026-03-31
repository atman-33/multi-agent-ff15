import { buildPromptPayloadParts, type PromptPart, type TextPromptPart } from "@/lib/prompt-parts";
import type { ActivityActorId, AgentId, ReportStatus, TeamMessageType, WorkerAgentId } from "@/lib/types/mission";
import type { OperationState, StateTransition } from "@/lib/operation-runtime/types";
import {
  buildSharedPromptContext,
  buildSharedPromptContextBundle,
  type BuildSharedPromptContextOptions,
} from "./common-context.server";
import { buildTextSection, joinXmlSections, wrapOperationPrompt } from "./prompt-xml";
import {
  composeReportWorkflowExtension,
  composeUserWorkflowExtension,
  composeWorkerWorkflowPrompt,
} from "./workflow-extension";

export interface ComposedPromptPayload {
  sharedContext: string;
  suppressedContext: string | null;
  promptBody: string;
  workflowExtension: string | null;
  effectivePrompt: string;
  payloadParts: TextPromptPart[];
}

function buildUserRequestSection(userMessage: string): string {
  return buildTextSection("user-request", userMessage);
}

function buildTaskInputSection(taskBody: string): string {
  return buildTextSection("task", taskBody);
}

function buildTeamMessageSection(input: {
  body: string;
  details?: string;
  from?: ActivityActorId;
  to?: AgentId;
  type: TeamMessageType;
  ruleIndex?: number;
}): string {
  if (input.type === "report") {
    return joinXmlSections([
      buildTextSection("worker-report", input.body, {
        from: input.from,
        to: input.to,
        ...(typeof input.ruleIndex === "number" ? { "rule-index": input.ruleIndex } : {}),
      }),
      input.details ? buildTextSection("worker-report-details", input.details) : null,
    ]);
  }

  return buildTextSection("team-message", input.body, {
    from: input.from,
    to: input.to,
    type: input.type,
  });
}

function composePayload(input: {
  context: BuildSharedPromptContextOptions;
  promptBody?: string | null;
  workflowExtension?: string | null;
}): ComposedPromptPayload {
  const { agentContext, suppressedContext } = buildSharedPromptContextBundle(input.context);
  const promptBody = input.promptBody?.trim() || "";
  const workflowExtension = input.workflowExtension?.trim() || null;
  const effectivePrompt = workflowExtension
    ? wrapOperationPrompt([agentContext, workflowExtension, promptBody])
    : promptBody;

  return {
    sharedContext: agentContext,
    suppressedContext,
    promptBody,
    workflowExtension,
    effectivePrompt,
    payloadParts: workflowExtension
      ? [{ type: "text", text: effectivePrompt }]
      : buildPromptPayloadParts(agentContext, [{ type: "text", text: effectivePrompt }]),
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

  const promptBody = buildUserRequestSection(input.userMessage);

  return {
    ...composePayload({
      context: {
        ...input.context,
        allowedWorkers: workflow.additionalContext ? undefined : input.context.allowedWorkers,
      },
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
  taskId: string;
  originalPrompt: string;
  operationStateOverride?: OperationState;
}): ComposedPromptPayload & { usedWorkflowExtension: boolean } {
  const workflow = composeWorkerWorkflowPrompt({
    missionId: input.missionId,
    originalPrompt: input.originalPrompt,
    agentId: input.agentId,
    taskId: input.taskId,
    operationStateOverride: input.operationStateOverride,
  });

  return {
    ...composePayload({
      context: { ...input.context, allowedWorkers: undefined },
      promptBody: workflow.usedWorkflowExtension ? null : buildTaskInputSection(workflow.promptText),
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
  ruleIndex?: number;
  artifacts?: string[];
  operationStateOverride?: OperationState;
  workflowExtensionOverride?: string | null;
  stateTransitionOverride?: StateTransition | null;
}): ComposedPromptPayload & { stateTransition: StateTransition | null } {
  const promptBody = buildTeamMessageSection({
    body: input.body,
    details: input.details,
    from: input.from,
    to: input.to,
    type: input.type,
    ruleIndex: input.ruleIndex,
  });

  const workflow =
    input.workflowExtensionOverride !== undefined
      ? {
          noctisGuidance: input.workflowExtensionOverride ?? "",
          stateTransition: input.stateTransitionOverride ?? null,
          nextWorkerDispatch: null,
        }
      : input.type === "report" && input.to === "noctis" && input.taskId && input.reportStatus
      ? composeReportWorkflowExtension({
          missionId: input.missionId,
          reportBody: input.body,
          reportDetails: input.details,
          fromAgent: input.from as WorkerAgentId,
          taskId: input.taskId,
          reportStatus: input.reportStatus,
          ruleIndex: input.ruleIndex,
          operationStateOverride: input.operationStateOverride,
        })
      : { noctisGuidance: "", stateTransition: null, nextWorkerDispatch: null };

  return {
    ...composePayload({
      context: {
        ...input.context,
        allowedWorkers: input.type === "report" ? undefined : input.context.allowedWorkers,
      },
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