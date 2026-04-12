import { buildPromptPayloadParts, type PromptPart, type TextPromptPart } from "@/lib/prompt-parts";
import type { ActivityActorId, AgentId, ReportStatus, TeamMessageType, WorkerAgentId, WorkflowNext } from "@/lib/types/mission";
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

function buildUserRequestSection(userMessage: string, toAgent: AgentId): string {
  return buildTextSection("user-request", userMessage, {
    from: "user",
    to: toAgent,
  });
}

function composeUserToPrimaryAgentPayload(input: {
  context: BuildSharedPromptContextOptions;
  userMessage: string;
  toAgent: AgentId;
  workflowExtension?: string | null;
}): ComposedPromptPayload {
  const workflowExtension = input.workflowExtension?.trim() || null;

  return composePayload({
    context: {
      ...input.context,
      allowedWorkers: workflowExtension ? undefined : input.context.allowedWorkers,
    },
    promptBody: buildUserRequestSection(input.userMessage, input.toAgent),
    workflowExtension,
  });
}

function buildTaskInputSection(taskBody: string, toAgent: WorkerAgentId): string {
  return buildTextSection("task", taskBody, {
    from: "noctis",
    to: toAgent,
  });
}

function buildWorkerReportBody(body: string, details?: string): string {
  const normalizedBody = body.trim();
  const normalizedDetails = details?.trim() ?? "";

  return [normalizedBody, normalizedDetails].filter(Boolean).join("\n\n");
}

function buildTeamMessageSection(input: {
  body: string;
  details?: string;
  from?: ActivityActorId;
  to?: AgentId;
  type: TeamMessageType;
  next?: WorkflowNext;
}): string {
  if (input.type === "report") {
    return buildTextSection("worker-report", buildWorkerReportBody(input.body, input.details), {
      from: input.from,
      to: input.to,
      ...(typeof input.next === "string" && input.next.trim() ? { next: input.next.trim() } : {}),
    });
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
}): ComposedPromptPayload & {
  operationActivated?: string;
  stateTransition?: StateTransition;
} {
  return composeUserToPrimaryAgentPrompt({
    ...input,
    toAgent: "noctis",
  });
}

export function composeUserToPrimaryAgentPrompt(input: {
  context: BuildSharedPromptContextOptions;
  userMessage: string;
  missionId: string;
  sessionId: string;
  isNewMission: boolean;
  selectedOperation?: string | null;
  toAgent: AgentId;
  workflowExtensionAppend?: string | null;
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
  });

  return {
    ...composeUserToPrimaryAgentPayload({
      context: input.context,
      userMessage: input.userMessage,
      toAgent: input.toAgent,
      workflowExtension: joinXmlSections([
        workflow.additionalContext,
        input.workflowExtensionAppend,
      ]),
    }),
    operationActivated: workflow.operationActivated,
    stateTransition: workflow.stateTransition,
  };
}

export function composeUserToPrimaryAgentPromptPreview(input: {
  context: BuildSharedPromptContextOptions;
  userMessage: string;
  toAgent: AgentId;
  workflowExtension?: string | null;
}): ComposedPromptPayload {
  return composeUserToPrimaryAgentPayload(input);
}

export function composeUserToNoctisPromptPreview(input: {
  context: BuildSharedPromptContextOptions;
  userMessage: string;
  workflowExtension?: string | null;
}): ComposedPromptPayload {
  return composeUserToPrimaryAgentPayload({
    ...input,
    toAgent: "noctis",
  });
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
      promptBody: workflow.usedWorkflowExtension
        ? null
        : buildTaskInputSection(workflow.promptText, input.agentId),
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
  next?: WorkflowNext;
  reportStatus?: ReportStatus;
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
    next: input.next,
  });

  const workflow =
    input.workflowExtensionOverride !== undefined
      ? {
          noctisGuidance: input.workflowExtensionOverride ?? "",
          stateTransition: input.stateTransitionOverride ?? null,
          nextWorkerDispatch: null,
        }
        : input.type === "report" && input.to === "noctis" && input.taskId && input.next
      ? composeReportWorkflowExtension({
          missionId: input.missionId,
          reportBody: input.body,
          fromAgent: input.from as WorkerAgentId,
          taskId: input.taskId,
          next: input.next,
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