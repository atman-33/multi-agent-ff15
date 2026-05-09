import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppLanguage } from "@/lib/app-language.server";
import { DEFAULT_NEW_MISSION_EXECUTION_TARGET_MODE } from "@/lib/mission-execution-target-mode";
import {
  createBanterFeedPresenter,
  type BanterFeedPresenter,
} from "@/lib/banter/feed-presenter";
import { normalizeBanterAgentId } from "@/lib/banter/runtime";
import {
  type AgentEvent,
  applyPartyRuntimeUpdate,
  eventToPartyUpdate,
  type PartyRuntimeState,
} from "@/lib/event-to-party-update";
import { getAllowedWorkers } from "@/lib/noctis-working-party";
import { type PromptPart, stringifyPromptParts } from "@/lib/prompt-parts";
import {
  coerceSessionStatus,
  isSessionStatusActive,
  type SessionStatus,
} from "@/lib/session-status";
import {
  buildRenderedSessionMessages,
  normalizeSessionMessages,
  resolveSessionMessageDisplay,
  type SessionPresentationMessage,
} from "@/lib/session-message-presentation";
import {
  mergeSessionLiveDraft,
  mergeStreamingText,
  parseSessionLiveEvent,
  type SessionLiveDraft,
} from "@/lib/session-stream";
import { getActivityActorLabel } from "@/lib/team-message-format";
import type { OperationOption } from "@/lib/operation-presentation";
import type {
  AgentContextUsage,
  BanterTimelineEntry,
  DelegationLedger,
  LunafreyaFacetSelection,
  MissionActivityLogEntry,
  MissionResumeBlockCode,
  MissionPrimaryAgentId,
  MissionSurfaceId,
  MissionTransportMode,
  MissionWorkflowProgress,
  MissionExecutionTargetMode,
  OperationState,
} from "@/lib/types/mission";
import type { BanterEntry, ChatMessage, PartyMember } from "@/lib/noctis-team-ui-types";
import type { MessageInfo, MessagePart } from "@/lib/opencode-session-types";
import { useChatStore } from "@/stores/chat-store";

type StreamAgentEvent = Extract<AgentEvent, { type: "message.part.updated" }> & {
  messageId?: string;
  part?: MessagePart;
  sessionId?: string;
};

type MissionTranscriptMode = "compact" | "full";

const PROGRESS_BANTER_DELAYS = {
  early: 4500,
  late: 10500,
} as const;

const ABORT_SETTLEMENT_DELAY_MS = 10000;
const MISSION_RUNTIME_RECOVERY_POLL_MS = 2000;
const MISSION_RUNTIME_SETTLING_POLL_MS = 4000;
const MISSION_RUNTIME_ACTIVE_POLL_MS = 3000;
const MISSION_RUNTIME_IDLE_POLL_MS = 15000;
const MISSION_RUNTIME_HIDDEN_POLL_MS = 30000;
const MISSION_SETTLED_BANTER_COOLDOWN_MS = 30000;
const MISSION_TRANSCRIPT_RETENTION_SOFT_LIMIT = 160;
const MISSION_TRANSCRIPT_RETENTION_TARGET = 120;
const EMPTY_PENDING_MISSION_MESSAGES: ChatMessage[] = [];

const INITIAL_BANTER_REVEAL_DELAY_MS = 90;
const SPEAKING_INDICATOR_MS = 980;

type WorkerSessionKey = "ignis" | "gladiolus" | "prompto";

const PARTY_MEMBER_META = [
  {
    id: "noctis",
    name: "Noctis",
    role: "Commander",
    imageSrc: "/images/noctis.png",
  },
  {
    id: "ignis",
    name: "Ignis",
    role: "Analyst",
    imageSrc: "/images/ignis.png",
    sessionKey: "ignis" as WorkerSessionKey,
  },
  {
    id: "gladio",
    name: "Gladio",
    role: "Executor",
    imageSrc: "/images/gladiolus.png",
    sessionKey: "gladiolus" as WorkerSessionKey,
  },
  {
    id: "prompto",
    name: "Prompto",
    role: "Reporter",
    imageSrc: "/images/prompto.png",
    sessionKey: "prompto" as WorkerSessionKey,
  },
] as const;

type PartyMemberMeta = (typeof PARTY_MEMBER_META)[number];
type WorkerPartyMemberMeta = PartyMemberMeta & { sessionKey: WorkerSessionKey };
type WorkerMemberId = WorkerPartyMemberMeta["id"];
type WorkerSessionIds = Record<WorkerMemberId, string | null>;

const WORKER_PARTY_MEMBERS = PARTY_MEMBER_META.filter(
  (member): member is WorkerPartyMemberMeta => "sessionKey" in member
);

function createInitialPartyRuntimeState(): PartyRuntimeState {
  return Object.fromEntries(
    PARTY_MEMBER_META.map((member) => [
      member.id,
      {
        status: "idle",
        detail: undefined,
        progress: undefined,
      },
    ])
  ) as PartyRuntimeState;
}

function createInitialWorkerSessionIds(): WorkerSessionIds {
  return Object.fromEntries(
    WORKER_PARTY_MEMBERS.map((member) => [member.id, null])
  ) as WorkerSessionIds;
}

function toWorkerSessionIds(sessions?: MissionResumePayload["sessions"] | null): WorkerSessionIds {
  return Object.fromEntries(
    WORKER_PARTY_MEMBERS.map((member) => [member.id, sessions?.[member.sessionKey] ?? null])
  ) as WorkerSessionIds;
}

function areWorkerSessionIdsEqual(left: WorkerSessionIds, right: WorkerSessionIds): boolean {
  return WORKER_PARTY_MEMBERS.every((member) => left[member.id] === right[member.id]);
}

function areActivitySourcesEqual(
  left: MissionActivityLogEntry["source"] | undefined,
  right: MissionActivityLogEntry["source"] | undefined,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  return (
    left.type === right.type &&
    left.sessionId === right.sessionId &&
    left.messageId === right.messageId &&
    left.taskId === right.taskId &&
    left.next === right.next &&
    left.reportStatus === right.reportStatus &&
    left.deliveryStatus === right.deliveryStatus
  );
}

function areMissionActivityLogsEqual(
  left: MissionActivityLogEntry[],
  right: MissionActivityLogEntry[],
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const candidate = right[index];
      return (
        !!candidate &&
        entry.id === candidate.id &&
        entry.actor === candidate.actor &&
        entry.speaker === candidate.speaker &&
        entry.kind === candidate.kind &&
        entry.body === candidate.body &&
        entry.createdAt === candidate.createdAt &&
        areActivitySourcesEqual(entry.source, candidate.source)
      );
    })
  );
}

function areOperationStatesEqual(
  left: OperationState | null,
  right: OperationState | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  return (
    left.operationRef === right.operationRef &&
    left.updatedAt === right.updatedAt &&
    left.status === right.status &&
    left.currentStep === right.currentStep &&
    left.iteration === right.iteration
  );
}

function areWorkflowProgressEqual(
  left: MissionWorkflowProgress | null,
  right: MissionWorkflowProgress | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  return (
    left.workflowLabel === right.workflowLabel &&
    left.currentStep === right.currentStep &&
    left.currentStepIndex === right.currentStepIndex &&
    left.totalSteps === right.totalSteps &&
    left.status === right.status &&
    left.updatedAt === right.updatedAt &&
    left.visitCount === right.visitCount &&
    left.isTerminal === right.isTerminal
  );
}

function areDelegationLedgersEqual(
  left: DelegationLedger | null,
  right: DelegationLedger | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  const leftSummaryKeys = Object.keys(left.completedSummaries);
  const rightSummaryKeys = Object.keys(right.completedSummaries);

  return (
    left.missionId === right.missionId &&
    left.activeTasks.length === right.activeTasks.length &&
    left.activeTasks.every((task, index) => {
      const candidate = right.activeTasks[index];
      return (
        !!candidate &&
        task.id === candidate.id &&
        task.assignedTo === candidate.assignedTo &&
        task.status === candidate.status
      );
    }) &&
    leftSummaryKeys.length === rightSummaryKeys.length &&
    leftSummaryKeys.every(
      (key) => right.completedSummaries[key] === left.completedSummaries[key],
    )
  );
}

const CONTEXT_USAGE_AGENT_IDS = [
  "noctis",
  "lunafreya",
  "ignis",
  "gladiolus",
  "prompto",
] as const;

function areContextUsageEntriesEqual(
  left: AgentContextUsage | null,
  right: AgentContextUsage | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  return (
    left.calculatedAt === right.calculatedAt &&
    left.providerID === right.providerID &&
    left.modelID === right.modelID &&
    left.windowTokens === right.windowTokens &&
    left.usedTokens === right.usedTokens &&
    left.remainingTokens === right.remainingTokens
  );
}

function areContextUsageByAgentEqual(
  left: ReturnType<typeof createInitialContextUsageByAgent>,
  right: ReturnType<typeof createInitialContextUsageByAgent>,
): boolean {
  return CONTEXT_USAGE_AGENT_IDS.every((agentId) =>
    areContextUsageEntriesEqual(left[agentId], right[agentId]),
  );
}

function getRuntimePrimaryFreshnessKey(payload: {
  latestPrimaryMessageCreatedAt?: string | null;
  latestPrimaryMessageId?: string | null;
  primarySessionId?: string | null;
}): string | null {
  if (!payload.primarySessionId) {
    return null;
  }

  return `${payload.primarySessionId}:${payload.latestPrimaryMessageId ?? ""}:${payload.latestPrimaryMessageCreatedAt ?? ""}`;
}

export function getMissionRuntimePollInterval({
  abortSettlementPhase,
  hasActiveDelegation,
  hasPendingTranscript,
  isDocumentVisible,
  isPrimaryStreamConnected,
  isSessionActive,
  isStreaming,
}: {
  abortSettlementPhase: AbortSettlementPhase;
  hasActiveDelegation: boolean;
  hasPendingTranscript: boolean;
  isDocumentVisible: boolean;
  isPrimaryStreamConnected: boolean;
  isSessionActive: boolean;
  isStreaming: boolean;
}): number {
  if (!isDocumentVisible) {
    return MISSION_RUNTIME_HIDDEN_POLL_MS;
  }

  if (!isPrimaryStreamConnected) {
    return MISSION_RUNTIME_RECOVERY_POLL_MS;
  }

  if (hasPendingTranscript || isStreaming || isSessionActive || hasActiveDelegation) {
    return MISSION_RUNTIME_ACTIVE_POLL_MS;
  }

  if (abortSettlementPhase !== "idle") {
    return MISSION_RUNTIME_SETTLING_POLL_MS;
  }

  return MISSION_RUNTIME_IDLE_POLL_MS;
}

function createInitialWorkerSessionStates(): Record<WorkerMemberId, SessionStatus | null> {
  return Object.fromEntries(WORKER_PARTY_MEMBERS.map((member) => [member.id, null])) as Record<
    WorkerMemberId,
    SessionStatus | null
  >;
}

export interface MissionSummary {
  missionId: string;
  title: string;
  objective?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  status: "active" | "completed" | "archived";
  activitySessionIds: string[];
}

export type MissionTransportStatus = "pending" | "submitted" | "failed" | "cancelled";

export type MissionTransportSummary = {
  pending: number;
  submitted: number;
  failed: number;
  cancelled: number;
  blocked: number;
};

export type MissionTransportArtifact = {
  id: string;
  missionId: string;
  createdAt: string;
  updatedAt: string;
  status: MissionTransportStatus;
  payload: {
    agent: string;
    sessionId: string;
    sessionTitle?: string;
  };
  failure?: {
    failedAt: string;
    failedBy: string;
    reason: string;
  };
  cancellation?: {
    cancelledAt: string;
    cancelledBy: string;
    reason: string;
  };
  replay?: {
    replayedAt: string;
    replayedBy: string;
    sourceItemId?: string;
    supersededByItemId?: string;
  };
};

export type MissionResumePayload = {
  missionId: string;
  schemaVersion?: number | null;
  surfaceId?: MissionSurfaceId | null;
  transportMode?: MissionTransportMode | null;
  primaryAgentId?: MissionPrimaryAgentId | null;
  primarySessionId?: string | null;
  title: string;
  objective?: string;
  createdAt: string;
  updatedAt: string;
  latestPrimaryMessageCreatedAt?: string | null;
  latestPrimaryMessageId?: string | null;
  archivedAt?: string | null;
  status: "active" | "completed" | "archived";
  executionProjectId?: string | null;
  executionTargetMode?: MissionExecutionTargetMode | null;
  contextProjectIds?: string[];
  baseBranch?: string | null;
  branch?: string | null;
  workspacePath?: string | null;
  workspaceStatus?: "ready" | "missing" | "deleted" | null;
  resumeBlockedCode?: MissionResumeBlockCode | null;
  resumeBlockedReason?: string | null;
  sessions: {
    primary?: string | null;
    noctis: string | null;
    ignis: string | null;
    gladiolus: string | null;
    prompto: string | null;
  };
  operationState?: OperationState | null;
  workflowProgress?: MissionWorkflowProgress | null;
  lunafreyaFacetSelection?: LunafreyaFacetSelection | null;
  primaryAgentOutbox?: MissionTransportArtifact[];
  transportSummary?: MissionTransportSummary;
  activityLog?: MissionActivityLogEntry[];
};

type MissionRuntimeSnapshot = MissionResumePayload & {
  contextUsageByAgent: Partial<
    Record<"noctis" | "lunafreya" | "ignis" | "gladiolus" | "prompto", AgentContextUsage | null>
  >;
  banterTimeline?: BanterTimelineEntry[];
  delegationLedger: DelegationLedger | null;
  sessionStatuses: Record<string, SessionStatus>;
};

function normalizeDelegationLedger(
  missionId: string,
  delegationLedger: DelegationLedger | null | undefined,
): DelegationLedger {
  return delegationLedger ?? {
    missionId,
    activeTasks: [],
    completedSummaries: {},
  };
}

export type MissionTranscriptPhase = "idle" | "loading" | "pending" | "ready" | "empty" | "error";
export type AbortSettlementPhase = "idle" | "settling" | "delayed";

export type MissionTranscriptRetentionState = {
  isActive: boolean;
  trimmedConversationUnitCount: number;
  trimmedMessageCount: number;
};

const EMPTY_MISSION_TRANSCRIPT_RETENTION_STATE: MissionTranscriptRetentionState = {
  isActive: false,
  trimmedConversationUnitCount: 0,
  trimmedMessageCount: 0,
};

type MissionTranscriptState = {
  errorMessage: string | null;
  missionId: string | null;
  phase: MissionTranscriptPhase;
  sessionId: string | null;
};

function createMissionTranscriptState(
  missionId: string | null,
  phase: MissionTranscriptPhase,
  errorMessage: string | null = null,
  sessionId: string | null = null,
): MissionTranscriptState {
  return {
    errorMessage,
    missionId,
    phase,
    sessionId,
  };
}

function resolveMissionTranscriptPhase(messages: ChatMessage[]): MissionTranscriptPhase {
  return messages.length > 0 ? "ready" : "empty";
}

function getMissionPrimarySessionIdFromPayload(
  payload: Pick<MissionResumePayload, "primarySessionId" | "sessions">,
): string | null {
  return payload.primarySessionId ?? payload.sessions.primary ?? payload.sessions.noctis;
}

function createInitialMessages(primaryAgentId: MissionPrimaryAgentId): ChatMessage[] {
  return [
    {
      id: "msg-init-1",
      sender: primaryAgentId,
      actor: primaryAgentId,
      speaker: primaryAgentId,
      kind: "assistant_message",
      content:
        primaryAgentId === "lunafreya"
          ? "I am here. What guidance do you need?"
          : "We're on the road. What do you need?",
      timestamp: new Date(Date.now() - 300000),
      source: "session",
    },
  ];
}

function getMissionActionResponseSessionId(
  data: {
    noctisSessionId?: string | null;
    lunafreyaSessionId?: string | null;
  },
  primaryAgentId: MissionPrimaryAgentId,
): string | null {
  return primaryAgentId === "lunafreya"
    ? (data.lunafreyaSessionId ?? null)
    : (data.noctisSessionId ?? null);
}

function computeBanterRevealDelay(queueLength: number): number {
  if (queueLength >= 4) {
    return 420;
  }

  const baseDelay = 500 + Math.floor(Math.random() * 351);
  return Math.max(420, baseDelay - Math.min(queueLength, 3) * 45);
}

function createInitialContextUsageByAgent(): Record<
  "noctis" | "lunafreya" | "ignis" | "gladiolus" | "prompto",
  AgentContextUsage | null
> {
  return {
    noctis: null,
    lunafreya: null,
    ignis: null,
    gladiolus: null,
    prompto: null,
  };
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type MissionClientDebugEventInput = {
  event:
    | "mission-load"
    | "primary-session-idle"
    | "session-history-sync"
    | "settled-evaluation"
    | "session-settled-emitted";
  stage: "observed" | "completed" | "failed";
  missionId: string | null | undefined;
  missionRouteBase: string;
  sessionId?: string | null;
  payload?: unknown;
};

type SessionHistorySyncOptions = {
  missionId?: string | null;
  preserveStreaming?: boolean;
  trackStreamingMessage?: boolean;
  expectedLatestAssistantMessageId?: string | null;
  reason?: string;
};

function shouldSkipMissionClientDebugLog(): boolean {
  return typeof navigator !== "undefined" && /\bjsdom\b/i.test(navigator.userAgent);
}

function appendMissionClientDebugLog(input: MissionClientDebugEventInput): void {
  if (
    !input.missionId ||
    input.missionRouteBase !== "/api/noctis/missions" ||
    typeof fetch !== "function" ||
    shouldSkipMissionClientDebugLog()
  ) {
    return;
  }

  void fetch(`${input.missionRouteBase}/${input.missionId}/debug`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      source: "client-hook",
      event: input.event,
      stage: input.stage,
      sessionId: input.sessionId ?? undefined,
      payload: input.payload ?? null,
    }),
  }).catch(() => undefined);
}

function mergeSessionHistorySyncOptions(
  current: SessionHistorySyncOptions | undefined,
  next: SessionHistorySyncOptions | undefined,
): SessionHistorySyncOptions {
  return {
    missionId: next?.missionId ?? current?.missionId,
    preserveStreaming: Boolean(current?.preserveStreaming || next?.preserveStreaming),
    trackStreamingMessage: Boolean(current?.trackStreamingMessage || next?.trackStreamingMessage),
    expectedLatestAssistantMessageId:
      next?.expectedLatestAssistantMessageId ?? current?.expectedLatestAssistantMessageId ?? null,
    reason: next?.reason ?? current?.reason,
  };
}

async function loadMissionRuntimeSnapshot(
  missionId: string,
  missionRouteBase: string,
): Promise<MissionRuntimeSnapshot> {
  const response = await fetch(`${missionRouteBase}/${missionId}/runtime`);
  if (!response.ok) {
    throw new Error(`mission runtime failed: ${response.status}`);
  }

  return (await response.json()) as MissionRuntimeSnapshot;
}

function mergeRuntimeSessionMessages(
  current: ChatMessage[],
  next: ChatMessage[],
  primaryAgentId: MissionPrimaryAgentId,
): ChatMessage[] {
  if (current.length === 0) {
    return next;
  }

  const currentById = new Map(current.map((message) => [message.id, message]));
  const merged = next.map((message) => {
    const existing = currentById.get(message.id);
    if (
      !existing ||
      existing.sender !== primaryAgentId ||
      message.sender !== primaryAgentId
    ) {
      return message;
    }

    const currentContentLength = existing.content.trim().length;
    const nextContentLength = message.content.trim().length;
    if (currentContentLength <= nextContentLength) {
      return message;
    }

    return {
      ...message,
      content: existing.content,
      detailContent: existing.detailContent ?? message.detailContent,
      detailState: existing.detailState === "full" ? "full" : message.detailState,
      rawText: existing.rawText ?? message.rawText,
      parts: existing.parts && existing.parts.length > 0 ? existing.parts : message.parts,
    };
  });

  const mergedIds = new Set(merged.map((message) => message.id));
  const optimisticTail = current.filter(
    (message) => message.sender === primaryAgentId && !mergedIds.has(message.id)
  );

  return optimisticTail.length > 0 ? [...merged, ...optimisticTail] : merged;
}

function toMissionTranscriptPresentationMessage(message: ChatMessage): SessionPresentationMessage {
  return {
    id: message.id,
    role: message.sender === "user" ? "user" : "assistant",
    sender: message.sender,
    senderLabel: getActivityActorLabel(message.sender),
    kind: message.kind,
    content: message.content,
    detailContent: message.detailContent,
    detailState: message.detailState,
    rawText: message.rawText,
    parts: message.parts,
    timestamp: message.timestamp,
    source: message.source,
  };
}

function applyMissionTranscriptRetention(
  messages: ChatMessage[],
  primaryAgentId: MissionPrimaryAgentId,
): {
  messages: ChatMessage[];
  retainedHistory: MissionTranscriptRetentionState;
} {
  if (messages.length === 0) {
    return {
      messages,
      retainedHistory: EMPTY_MISSION_TRANSCRIPT_RETENTION_STATE,
    };
  }

  const renderedMessages = buildRenderedSessionMessages(
    messages.map(toMissionTranscriptPresentationMessage),
    {
      continuityAssistant: {
        sender: primaryAgentId,
        senderLabel: getActivityActorLabel(primaryAgentId),
      },
    },
  );

  if (renderedMessages.length <= MISSION_TRANSCRIPT_RETENTION_SOFT_LIMIT) {
    return {
      messages,
      retainedHistory: EMPTY_MISSION_TRANSCRIPT_RETENTION_STATE,
    };
  }

  const retainedRenderedMessages = renderedMessages.slice(-MISSION_TRANSCRIPT_RETENTION_TARGET);

  const retainedSourceMessageIds = new Set(
    retainedRenderedMessages.flatMap((message) => message.sourceMessageIds),
  );

  const retainedMessages = messages.filter((message) => retainedSourceMessageIds.has(message.id));

  return {
    messages: retainedMessages,
    retainedHistory: {
      isActive: true,
      trimmedConversationUnitCount: renderedMessages.length - retainedRenderedMessages.length,
      trimmedMessageCount: messages.length - retainedMessages.length,
    },
  };
}

function resolveMissionTranscriptMode(surfaceId: MissionSurfaceId): MissionTranscriptMode {
  return surfaceId === "noctis_team" || surfaceId === "lunafreya" ? "compact" : "full";
}

function getCompactMissionMessageVisibleBody(message: ChatMessage): string {
  const rawText =
    typeof message.rawText === "string" && message.rawText.trim().length > 0
      ? message.rawText
      : message.content;

  return resolveSessionMessageDisplay({
    rawText,
    fallbackSender: message.sender,
    fallbackSenderLabel: getActivityActorLabel(message.sender),
  }).displayContent.trim();
}

function isCriticalCompactMissionMessage(message: ChatMessage, visibleBody: string): boolean {
  if (message.errorInfo) {
    return true;
  }

  return /\bblocked\b/i.test(visibleBody || message.content || message.rawText || "");
}

function compactMissionTranscriptMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) {
    return messages;
  }

  const compacted: ChatMessage[] = [];
  let assistantTurn: ChatMessage[] = [];
  let hasSeenUserMessage = false;

  const flushAssistantTurn = () => {
    if (assistantTurn.length === 0) {
      return;
    }

    const retainedMessageIds = new Set<string>();
    const senderSelections = new Map<
      ChatMessage["sender"],
      {
        criticalIds: string[];
        lastVisibleId: string | null;
        lastFallbackId: string | null;
      }
    >();

    assistantTurn.forEach((message) => {
      const selection = senderSelections.get(message.sender) ?? {
        criticalIds: [],
        lastVisibleId: null,
        lastFallbackId: null,
      };
      const visibleBody = getCompactMissionMessageVisibleBody(message);

      if (isCriticalCompactMissionMessage(message, visibleBody)) {
        selection.criticalIds.push(message.id);
      }

      if (visibleBody) {
        selection.lastVisibleId = message.id;
      } else {
        selection.lastFallbackId = message.id;
      }

      senderSelections.set(message.sender, selection);
    });

    senderSelections.forEach((selection) => {
      selection.criticalIds.forEach((id) => retainedMessageIds.add(id));

      if (selection.lastVisibleId) {
        retainedMessageIds.add(selection.lastVisibleId);
        return;
      }

      if (selection.lastFallbackId) {
        retainedMessageIds.add(selection.lastFallbackId);
      }
    });

    compacted.push(...assistantTurn.filter((message) => retainedMessageIds.has(message.id)));
    assistantTurn = [];
  };

  messages.forEach((message) => {
    if (message.sender === "user") {
      hasSeenUserMessage = true;
      flushAssistantTurn();
      compacted.push(message);
      return;
    }

    if (!hasSeenUserMessage) {
      compacted.push(message);
      return;
    }

    assistantTurn.push(message);
  });

  flushAssistantTurn();

  return compacted;
}

function applyMissionTranscriptMode(
  messages: ChatMessage[],
  transcriptMode: MissionTranscriptMode,
): ChatMessage[] {
  return transcriptMode === "compact" ? compactMissionTranscriptMessages(messages) : messages;
}

function applyMissionTranscriptPolicy(
  messages: ChatMessage[],
  primaryAgentId: MissionPrimaryAgentId,
  transcriptMode: MissionTranscriptMode,
): {
  messages: ChatMessage[];
  retainedHistory: MissionTranscriptRetentionState;
} {
  return applyMissionTranscriptRetention(
    applyMissionTranscriptMode(messages, transcriptMode),
    primaryAgentId,
  );
}

function toSessionChatMessages(
  messages: MessageInfo[],
  primaryAgentId: MissionPrimaryAgentId,
): ChatMessage[] {
  const messageErrorsById = new Map(
    messages.map((message) => [message.info.id, message.info.error] as const),
  );

  return normalizeSessionMessages(messages).map((message) => {
    const sender = message.sender ?? primaryAgentId;

    return {
      id: message.id,
      sender,
      actor: sender,
      speaker: sender,
      kind: message.kind,
      content: message.content,
      detailContent: message.detailContent,
      detailState: message.detailState,
      errorInfo: messageErrorsById.get(message.id),
      rawText: message.rawText,
      parts: message.parts,
      timestamp: message.timestamp,
      source: message.source,
    };
  });
}

function getLatestAssistantMessageId(
  messages: ChatMessage[],
  primaryAgentId: MissionPrimaryAgentId,
): string | null {
  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.sender === primaryAgentId);

  return latestAssistantMessage?.id ?? null;
}

async function loadSessionMessages(
  sessionId: string,
  primaryAgentId: MissionPrimaryAgentId,
  transcriptMode: MissionTranscriptMode,
): Promise<ChatMessage[]> {
  const response = await fetch(`/api/session/${sessionId}`, transcriptMode === "compact"
    ? {
        headers: {
          "x-session-detail-state": "summary",
        },
      }
    : undefined);
  if (!response.ok) {
    throw new Error(`session messages failed: ${response.status}`);
  }

  const data = (await response.json()) as { messages?: MessageInfo[] };
  const rawMessages = data.messages ?? [];
  const convertedMessages = toSessionChatMessages(rawMessages, primaryAgentId);

  return convertedMessages;
}

function getInitialTranscriptRetentionState(
  activeMissionId: string | null,
  initialMissionData: MissionResumePayload | null | undefined,
  initialMessageInfos: MessageInfo[] | null | undefined,
  primaryAgentId: MissionPrimaryAgentId,
  transcriptMode: MissionTranscriptMode,
): MissionTranscriptRetentionState {
  if (
    activeMissionId &&
    initialMissionData?.missionId === activeMissionId &&
    Array.isArray(initialMessageInfos) &&
    initialMessageInfos.length > 0
  ) {
    return applyMissionTranscriptPolicy(
      toSessionChatMessages(initialMessageInfos, primaryAgentId),
      primaryAgentId,
      transcriptMode,
    ).retainedHistory;
  }

  return EMPTY_MISSION_TRANSCRIPT_RETENTION_STATE;
}

function mergeOptimisticMissionMessages(
  sessionMessages: ChatMessage[],
  pendingMissionMessages: ChatMessage[],
): ChatMessage[] {
  if (pendingMissionMessages.length === 0) {
    return sessionMessages;
  }

  const getComparableUserMessageKey = (message: ChatMessage): string | null => {
    if (message.sender !== "user") {
      return null;
    }

    const resolvedDisplay = resolveSessionMessageDisplay({
      rawText: message.rawText ?? message.detailContent ?? message.content,
      fallbackSender: message.sender,
      fallbackSenderLabel: getActivityActorLabel(message.sender),
    }).displayContent.trim();

    return `${message.kind}:${resolvedDisplay}`;
  };

  const authoritativeUserMessageKeys = new Set(
    sessionMessages
      .map((message) => getComparableUserMessageKey(message))
      .filter((key): key is string => key !== null),
  );
  const filteredPendingMissionMessages = pendingMissionMessages.filter((message) => {
    const comparableKey = getComparableUserMessageKey(message);
    return comparableKey === null || !authoritativeUserMessageKeys.has(comparableKey);
  });

  if (filteredPendingMissionMessages.length === 0) {
    return sessionMessages;
  }

  const hasUserMessage = sessionMessages.some((message) => message.sender === "user");
  const mergedMessages = hasUserMessage
    ? [...sessionMessages, ...filteredPendingMissionMessages]
    : [...filteredPendingMissionMessages, ...sessionMessages];
  const seenMessageIds = new Set<string>();

  return mergedMessages.filter((message) => {
    if (seenMessageIds.has(message.id)) {
      return false;
    }

    seenMessageIds.add(message.id);
    return true;
  });
}

function getInitialTranscriptMessages(
  activeMissionId: string | null,
  initialMissionData: MissionResumePayload | null | undefined,
  initialMessageInfos: MessageInfo[] | null | undefined,
  initialMessages: ChatMessage[],
  pendingMissionMessages: ChatMessage[],
  primaryAgentId: MissionPrimaryAgentId,
  transcriptMode: MissionTranscriptMode,
): ChatMessage[] {
  if (
    activeMissionId &&
    initialMissionData?.missionId === activeMissionId &&
    Array.isArray(initialMessageInfos) &&
    initialMessageInfos.length > 0
  ) {
    const preloadedMessages = applyMissionTranscriptPolicy(
      toSessionChatMessages(initialMessageInfos, primaryAgentId),
      primaryAgentId,
      transcriptMode,
    ).messages;
    return preloadedMessages.length > 0 ? preloadedMessages : [];
  }

  if (activeMissionId && pendingMissionMessages.length > 0) {
    return pendingMissionMessages;
  }

  return activeMissionId ? [] : initialMessages;
}

function getInitialTranscriptState(
  activeMissionId: string | null,
  initialMissionData: MissionResumePayload | null | undefined,
  initialMessageInfos: MessageInfo[] | null | undefined,
  initialMessages: ChatMessage[],
  pendingMissionMessages: ChatMessage[],
  primaryAgentId: MissionPrimaryAgentId,
  transcriptMode: MissionTranscriptMode,
): MissionTranscriptState {
  if (!activeMissionId) {
    return createMissionTranscriptState(null, "idle");
  }

  const nextMessages = getInitialTranscriptMessages(
    activeMissionId,
    initialMissionData,
    initialMessageInfos,
    initialMessages,
    pendingMissionMessages,
    primaryAgentId,
    transcriptMode,
  );

  if (
    activeMissionId &&
    pendingMissionMessages.length > 0 &&
    !(initialMissionData?.missionId === activeMissionId && Array.isArray(initialMessageInfos) && initialMessageInfos.length > 0)
  ) {
    return createMissionTranscriptState(activeMissionId, "loading");
  }

  if (nextMessages.length === 0) {
    return createMissionTranscriptState(activeMissionId, "loading");
  }

  return createMissionTranscriptState(
    activeMissionId,
    resolveMissionTranscriptPhase(nextMessages),
  );
}

function getVisibleMissionMessages(
  activeMissionId: string | null,
  sessionMessages: ChatMessage[],
  transcriptState: MissionTranscriptState,
  pendingMissionMessages: ChatMessage[],
): ChatMessage[] {
  const visibleMessages = mergeOptimisticMissionMessages(sessionMessages, pendingMissionMessages);

  if (!activeMissionId) {
    return sessionMessages;
  }

  if (transcriptState.missionId !== activeMissionId) {
    return [];
  }

  if (
    (transcriptState.phase === "loading" || transcriptState.phase === "pending") &&
    visibleMessages.length > 0
  ) {
    return visibleMessages;
  }

  if (transcriptState.phase !== "ready" && visibleMessages.length === 0) {
    return [];
  }

  return visibleMessages;
}

function getVisibleTranscriptState(
  activeMissionId: string | null,
  transcriptState: MissionTranscriptState,
): MissionTranscriptState {
  if (!activeMissionId) {
    return createMissionTranscriptState(null, "idle");
  }

  if (transcriptState.missionId !== activeMissionId) {
    return createMissionTranscriptState(activeMissionId, "loading");
  }

  return transcriptState;
}

export interface UseAgentSessionOptions {
  activeMissionId: string | null;
  surfaceId?: MissionSurfaceId;
  language?: AppLanguage;
  initialMissionData?: MissionResumePayload | null;
  initialMessageInfos?: MessageInfo[] | null;
  selectedExecutionProjectId?: string | null;
  selectedExecutionTargetMode?: MissionExecutionTargetMode;
  selectedContextProjectIds?: string[];
  selectedLunafreyaJobId?: string | null;
  selectedLunafreyaSkillIds?: string[];
}

export interface UseAgentSessionReturn {
  sessionId: string | null;
  messages: ChatMessage[];
  retainedHistory: MissionTranscriptRetentionState;
  liveDraft: SessionLiveDraft | null;
  streamingMessageId: string | null;
  streamingContent: string;
  banterEntries: BanterEntry[];
  latestBanterEntryId: string | null;
  speakingAgentId: string | null;
  partyMembers: PartyMember[];
  historyErrorMessage: string | null;
  historyPhase: MissionTranscriptPhase;
  abortSettlementPhase: AbortSettlementPhase;
  isStartingMission: boolean;
  isSessionActive: boolean;
  isStreaming: boolean;
  isLoadingHistory: boolean;
  availableOperations: OperationOption[];
  selectedOperation: string | null;
  activeOperationState: OperationState | null;
  workflowProgress: MissionWorkflowProgress | null;
  activityLog: MissionActivityLogEntry[];
  primaryContextUsage: AgentContextUsage | null;
  isOperationSelectionLocked: boolean;
  setSelectedOperation: (operationRef: string | null) => void;
  send: (parts: PromptPart[]) => Promise<string | null>;
  abort: () => Promise<void>;
}

export async function withMissionStartPending<T>(
  setPending: (next: boolean) => void,
  action: () => Promise<T>
): Promise<T> {
  setPending(true);

  try {
    return await action();
  } finally {
    setPending(false);
  }
}

export function useAgentSession({
  activeMissionId,
  surfaceId: requestedSurfaceId,
  language: _language = "other",
  initialMissionData,
  initialMessageInfos,
  selectedExecutionProjectId,
  selectedExecutionTargetMode = DEFAULT_NEW_MISSION_EXECUTION_TARGET_MODE,
  selectedContextProjectIds = [],
  selectedLunafreyaJobId = null,
  selectedLunafreyaSkillIds = [],
}: UseAgentSessionOptions): UseAgentSessionReturn {
  const surfaceId =
    requestedSurfaceId ??
    (initialMissionData?.surfaceId === "lunafreya" ? "lunafreya" : "noctis_team");
  const transcriptMode = resolveMissionTranscriptMode(surfaceId);
  const primaryAgentId: MissionPrimaryAgentId =
    initialMissionData?.primaryAgentId === "lunafreya" || surfaceId === "lunafreya"
      ? "lunafreya"
      : "noctis";
  const isLunafreyaSurface = primaryAgentId === "lunafreya";
  const missionRouteBase = isLunafreyaSurface ? "/api/lunafreya/missions" : "/api/noctis/missions";
  const missionStartEndpoint = isLunafreyaSurface
    ? "/api/lunafreya/mission/start"
    : "/api/noctis/mission/start";
  const missionContinueEndpoint = isLunafreyaSurface
    ? "/api/lunafreya/mission/continue"
    : "/api/noctis/mission/continue";
  const initialMessages = useMemo(() => createInitialMessages(primaryAgentId), [primaryAgentId]);
  const pendingMissionSessionId = useChatStore((state) =>
    activeMissionId ? (state.pendingMissionSessions[activeMissionId] ?? null) : null
  );
  const pendingMissionMessageMap = useChatStore((state) => state.pendingMissionMessages);
  const pendingMissionMessages = activeMissionId
    ? (pendingMissionMessageMap[activeMissionId] ?? EMPTY_PENDING_MISSION_MESSAGES)
    : EMPTY_PENDING_MISSION_MESSAGES;
  const initialNoctisSessionId =
    activeMissionId && initialMissionData?.missionId === activeMissionId
      ? (initialMissionData.sessions.primary ?? initialMissionData.sessions.noctis)
      : pendingMissionSessionId;
  const initialWorkerSessionIds =
    activeMissionId && initialMissionData?.missionId === activeMissionId
      ? toWorkerSessionIds(initialMissionData.sessions)
      : createInitialWorkerSessionIds();
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>(() =>
    getInitialTranscriptMessages(
      activeMissionId,
      initialMissionData,
      initialMessageInfos,
      initialMessages,
      pendingMissionMessages,
      primaryAgentId,
      transcriptMode,
    )
  );
  const [retainedHistory, setRetainedHistory] = useState<MissionTranscriptRetentionState>(() =>
    getInitialTranscriptRetentionState(
      activeMissionId,
      initialMissionData,
      initialMessageInfos,
      primaryAgentId,
      transcriptMode,
    )
  );
  const [availableOperations, setAvailableOperations] = useState<OperationOption[]>([]);
  const [selectedOperation, setSelectedOperation] = useState<string | null>(null);
  const [activeOperationState, setActiveOperationState] = useState<OperationState | null>(null);
  const [workflowProgress, setWorkflowProgress] = useState<MissionWorkflowProgress | null>(
    activeMissionId && initialMissionData?.missionId === activeMissionId
      ? (initialMissionData.workflowProgress ?? null)
      : null,
  );
  const [activityLog, setActivityLog] = useState<MissionActivityLogEntry[]>(
    activeMissionId && initialMissionData?.missionId === activeMissionId
      ? (initialMissionData.activityLog ?? [])
      : [],
  );
  const [banterEntries, setBanterEntries] = useState<BanterEntry[]>([]);
  const [latestBanterEntryId, setLatestBanterEntryId] = useState<string | null>(null);
  const [speakingAgentId, setSpeakingAgentId] = useState<string | null>(null);
  const [partyRuntime, setPartyRuntime] = useState<PartyRuntimeState>(
    createInitialPartyRuntimeState
  );
  const [delegationLedger, setDelegationLedger] = useState<DelegationLedger | null>(null);
  const [contextUsageByAgent, setContextUsageByAgent] = useState(createInitialContextUsageByAgent);
  const [noctisSessionId, setNoctisSessionId] = useState<string | null>(initialNoctisSessionId);
  const [workerSessionIds, setWorkerSessionIds] =
    useState<WorkerSessionIds>(initialWorkerSessionIds);
  const [isStartingMission, setIsStartingMission] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPrimaryStreamConnected, setIsPrimaryStreamConnected] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [liveDraft, setLiveDraft] = useState<SessionLiveDraft | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [abortSettlementPhase, setAbortSettlementPhase] =
    useState<AbortSettlementPhase>("idle");
  const [transcriptState, setTranscriptState] = useState<MissionTranscriptState>(() =>
    getInitialTranscriptState(
      activeMissionId,
      initialMissionData,
      initialMessageInfos,
      initialMessages,
      pendingMissionMessages,
      primaryAgentId,
      transcriptMode,
    )
  );

  const missionIdRef = useRef<string | null>(null);
  const activeMissionIdRef = useRef<string | null>(activeMissionId);
  const sessionMessagesRef = useRef<ChatMessage[]>(sessionMessages);
  const retainedHistoryRef = useRef<MissionTranscriptRetentionState>(retainedHistory);
  const noctisSessionIdRef = useRef<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const workerEventSourcesRef = useRef<Partial<Record<WorkerMemberId, EventSource>>>({});
  const idleTimerRef = useRef<number | null>(null);
  const abortSettlementTimerRef = useRef<number | null>(null);
  const banterTimelineMissionIdRef = useRef<string | null>(null);
  const banterFeedPresenterRef = useRef<BanterFeedPresenter | null>(null);
  const hasHydratedNoctisSettledRef = useRef(false);
  const lastNoctisSettledRef = useRef(false);
  const lastNoctisSettledEmitAtRef = useRef<number | null>(null);
  const lastSessionStateRef = useRef<SessionStatus | null>(null);
  const lastWorkerSessionStatesRef = useRef<Record<WorkerMemberId, SessionStatus | null>>(
    createInitialWorkerSessionStates()
  );
  const messages = useMemo(
    () =>
      getVisibleMissionMessages(
        activeMissionId,
        sessionMessages,
        transcriptState,
        pendingMissionMessages,
      ),
    [activeMissionId, pendingMissionMessages, sessionMessages, transcriptState]
  );
  const visibleTranscriptState = useMemo(
    () => getVisibleTranscriptState(activeMissionId, transcriptState),
    [activeMissionId, transcriptState]
  );
  const isLoadingHistory =
    activeMissionId !== null &&
    visibleTranscriptState.phase === "loading" &&
    messages.length === 0;
  const sessionStatusRef = useRef<SessionStatus | null>(null);
  const progressTimersRef = useRef<
    Partial<Record<string, Partial<Record<"early" | "late", ReturnType<typeof setTimeout>>>>>
  >({});
  const sessionHistorySyncInFlightRef = useRef<Set<string>>(new Set());
  const sessionHistorySyncQueuedRef = useRef<Map<string, SessionHistorySyncOptions>>(new Map());
  const loadMissionHydrationInFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const completedLoadMissionHydrationKeysRef = useRef<Set<string>>(new Set());
  const lastLoadMissionSignatureRef = useRef<string | null>(null);
  const loadMissionInvocationIdRef = useRef(0);
  const runtimeRefreshInFlightRef = useRef(false);
  const runtimeRefreshQueuedRef = useRef(false);
  const runtimePrimaryFreshnessKeyRef = useRef<string | null>(null);
  const applyMissionRuntimeSnapshotRef = useRef<((runtime: MissionRuntimeSnapshot) => void) | null>(null);
  const refreshMissionRuntimeRef = useRef<(() => Promise<void>) | null>(null);
  const transcriptStateRef = useRef<MissionTranscriptState>(transcriptState);

  const sessionStates = useChatStore((state) => state.sessionStates);
  const setServerSessionState = useChatStore((state) => state.setServerSessionState);
  const replaceServerSessionStates = useChatStore((state) => state.replaceServerSessionStates);
  const setOptimisticSessionState = useChatStore((state) => state.setOptimisticSessionState);
  const setPendingMissionSession = useChatStore((state) => state.setPendingMissionSession);
  const clearPendingMissionSession = useChatStore((state) => state.clearPendingMissionSession);
  const setPendingMissionMessages = useChatStore((state) => state.setPendingMissionMessages);
  const clearPendingMissionMessages = useChatStore((state) => state.clearPendingMissionMessages);

  const clearStreamingState = useCallback(() => {
    streamingMessageIdRef.current = null;
    setLiveDraft(null);
    setStreamingContent("");
  }, []);

  const clearAbortSettlement = useCallback(() => {
    if (abortSettlementTimerRef.current) {
      clearTimeout(abortSettlementTimerRef.current);
      abortSettlementTimerRef.current = null;
    }

    setAbortSettlementPhase("idle");
  }, []);

  const replaceSessionMessages = useCallback(
    (nextMessages: ChatMessage[]): ChatMessage[] => {
      const retained = applyMissionTranscriptPolicy(nextMessages, primaryAgentId, transcriptMode);
      sessionMessagesRef.current = retained.messages;
      retainedHistoryRef.current = retained.retainedHistory;
      setSessionMessages(retained.messages);
      setRetainedHistory(retained.retainedHistory);
      return retained.messages;
    },
    [primaryAgentId, transcriptMode],
  );

  const updateSessionMessages = useCallback(
    (updater: (current: ChatMessage[]) => ChatMessage[]): ChatMessage[] => {
      const nextMessages = updater(sessionMessagesRef.current);
      const retained = applyMissionTranscriptPolicy(nextMessages, primaryAgentId, transcriptMode);
      const nextRetainedHistory = retained.retainedHistory.isActive
        ? {
            isActive: true,
            trimmedConversationUnitCount:
              retainedHistoryRef.current.trimmedConversationUnitCount +
              retained.retainedHistory.trimmedConversationUnitCount,
            trimmedMessageCount:
              retainedHistoryRef.current.trimmedMessageCount +
              retained.retainedHistory.trimmedMessageCount,
          }
        : retainedHistoryRef.current.isActive
          ? retainedHistoryRef.current
          : retained.retainedHistory;

      sessionMessagesRef.current = retained.messages;
      retainedHistoryRef.current = nextRetainedHistory;
      setSessionMessages(retained.messages);
      setRetainedHistory(nextRetainedHistory);
      return retained.messages;
    },
    [primaryAgentId, transcriptMode],
  );

  const beginAbortSettlement = useCallback(() => {
    if (abortSettlementTimerRef.current) {
      clearTimeout(abortSettlementTimerRef.current);
    }

    setAbortSettlementPhase("settling");
    abortSettlementTimerRef.current = window.setTimeout(() => {
      setAbortSettlementPhase((current) => (current === "idle" ? "idle" : "delayed"));
      abortSettlementTimerRef.current = null;
    }, ABORT_SETTLEMENT_DELAY_MS);
  }, []);

  if (!banterFeedPresenterRef.current) {
    banterFeedPresenterRef.current = createBanterFeedPresenter({
      initialRevealDelayMs: INITIAL_BANTER_REVEAL_DELAY_MS,
      computeRevealDelay: computeBanterRevealDelay,
      speakingIndicatorMs: SPEAKING_INDICATOR_MS,
      onChange: (state) => {
        setBanterEntries(state.entries);
        setLatestBanterEntryId(state.latestBanterEntryId);
        setSpeakingAgentId(state.speakingAgentId);
      },
    });
  }

  useEffect(() => {
    transcriptStateRef.current = transcriptState;
  }, [transcriptState]);

  useEffect(() => {
    sessionMessagesRef.current = sessionMessages;
  }, [sessionMessages]);

  useEffect(() => {
    retainedHistoryRef.current = retainedHistory;
  }, [retainedHistory]);

  useEffect(() => {
    let cancelled = false;

    const loadAvailableOperations = async () => {
      if (isLunafreyaSurface) {
        setAvailableOperations([]);
        return;
      }

      try {
        const query = selectedExecutionProjectId
          ? `?executionProjectId=${encodeURIComponent(selectedExecutionProjectId)}`
          : "";
        const response = await fetch(`/api/noctis/operations${query}`);
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { operations?: OperationOption[] };
        if (!cancelled) {
          setAvailableOperations(data.operations ?? []);
        }
      } catch {
        if (!cancelled) {
          setAvailableOperations([]);
        }
      }
    };

    void loadAvailableOperations();

    return () => {
      cancelled = true;
    };
  }, [isLunafreyaSurface, selectedExecutionProjectId]);

  useEffect(() => {
    if (activeMissionId || !selectedOperation) {
      return;
    }

    if (availableOperations.some((operation) => operation.value === selectedOperation)) {
      return;
    }

    setSelectedOperation(null);
  }, [activeMissionId, availableOperations, selectedOperation]);

  useEffect(() => {
    if (!activeMissionId) {
      return;
    }

    setIsStartingMission(false);
  }, [activeMissionId]);

  const sessionStatus = noctisSessionId ? (sessionStates[noctisSessionId] ?? null) : null;
  const hasPendingPrimaryTranscript =
    activeMissionId !== null &&
    visibleTranscriptState.phase === "pending" &&
    (visibleTranscriptState.sessionId === null || visibleTranscriptState.sessionId === noctisSessionId);
  const isSessionActive = isSessionStatusActive(sessionStatus) || hasPendingPrimaryTranscript;
  const partyMembers = useMemo<PartyMember[]>(
    () =>
      PARTY_MEMBER_META.map((member) => {
        const runtime = partyRuntime[member.id] ?? {
          status: "idle",
        };
        const normalizedAgentId = normalizeBanterAgentId(member.id);
        const contextUsage = normalizedAgentId
          ? (contextUsageByAgent[normalizedAgentId] ?? null)
          : null;

        const fallbackStatus = runtime.status === "working" ? "idle" : runtime.status;

        if (member.id !== "noctis") {
          const workerSessionId = workerSessionIds[member.id as WorkerMemberId];
          const workerSessionStatus = workerSessionId
            ? (sessionStates[workerSessionId] ?? null)
            : null;
          const isWorkerActive = isSessionStatusActive(workerSessionStatus);

          if (isWorkerActive) {
            return {
              id: member.id,
              name: member.name,
              role: member.role,
              imageSrc: member.imageSrc,
              contextUsage,
              status: "working",
              detail: runtime.detail,
              progress: runtime.progress,
            };
          }

          return {
            id: member.id,
            name: member.name,
            role: member.role,
            imageSrc: member.imageSrc,
            contextUsage,
            status: fallbackStatus,
            detail: runtime.detail,
            progress: runtime.progress,
          };
        }

        if (member.id === "noctis" && isSessionActive) {
          return {
            id: member.id,
            name: member.name,
            role: member.role,
            imageSrc: member.imageSrc,
            contextUsage,
            status: "working",
            detail: runtime.detail,
            progress: runtime.progress,
          };
        }

        if (member.id === "noctis" && isStreaming) {
          return {
            id: member.id,
            name: member.name,
            role: member.role,
            imageSrc: member.imageSrc,
            contextUsage,
            status: "working",
            detail: runtime.detail,
            progress: runtime.progress,
          };
        }

        return {
          id: member.id,
          name: member.name,
          role: member.role,
          imageSrc: member.imageSrc,
          contextUsage,
          status: fallbackStatus,
          detail: runtime.detail,
          progress: runtime.progress,
        };
      }),
    [
      contextUsageByAgent,
      isSessionActive,
      isStreaming,
      partyRuntime,
      sessionStates,
      workerSessionIds,
    ]
  );

  useEffect(() => {
    if (!initialNoctisSessionId) {
      return;
    }

    setNoctisSessionId((current) => current ?? initialNoctisSessionId);
    noctisSessionIdRef.current = noctisSessionIdRef.current ?? initialNoctisSessionId;
  }, [initialNoctisSessionId]);

  const clearBanterEntries = useCallback(() => {
    banterFeedPresenterRef.current?.clear();
  }, []);

  const syncPersistedBanterTimeline = useCallback(
    (timeline: BanterTimelineEntry[]) => {
      banterFeedPresenterRef.current?.applyTimelineSnapshot(timeline);
    },
    []
  );

  const persistAmbientBanter = useCallback(
    async (input: {
      speakerAgent: string;
      cue: string;
      renderedMessage?: string;
      sourceEvent: string;
    }) => {
      const missionId = missionIdRef.current ?? activeMissionIdRef.current;
      if (!missionId) {
        return;
      }

      const response = await fetch(`${missionRouteBase}/${missionId}/banter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          speakerAgent: input.speakerAgent,
          cue: input.cue,
          renderedMessage: input.renderedMessage,
          sourceEvent: input.sourceEvent,
        }),
      }).catch(() => null);

      if (!response?.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        entry?: BanterTimelineEntry | null;
      } | null;

      if (payload?.entry) {
        banterFeedPresenterRef.current?.enqueueLiveEntries([payload.entry]);
      }
    },
    [missionRouteBase]
  );

  const clearProgressBanter = useCallback((agentId?: string) => {
    const ids = agentId ? [agentId] : Object.keys(progressTimersRef.current);

    for (const id of ids) {
      const normalized = normalizeBanterAgentId(id);
      const key = normalized ?? id;
      const timers = progressTimersRef.current[key];
      if (!timers) {
        continue;
      }
      if (timers.early) {
        clearTimeout(timers.early);
      }
      if (timers.late) {
        clearTimeout(timers.late);
      }
      delete progressTimersRef.current[key];
    }
  }, []);

  useEffect(() => {
    sessionStatusRef.current = sessionStatus;
  }, [sessionStatus]);

  const closeWorkerEventSources = useCallback(() => {
    for (const eventSource of Object.values(workerEventSourcesRef.current)) {
      eventSource?.close();
    }
    workerEventSourcesRef.current = {};
  }, []);

  useEffect(() => {
    const previousMissionId = activeMissionIdRef.current;
    const previousPrimarySessionId = noctisSessionIdRef.current;
    activeMissionIdRef.current = activeMissionId;

    if (previousMissionId === activeMissionId) {
      return;
    }

    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsPrimaryStreamConnected(false);
    closeWorkerEventSources();

    const nextPrimarySessionId =
      initialNoctisSessionId ??
      (missionIdRef.current === activeMissionId ? previousPrimarySessionId : null);
    const shouldPreserveStartedMissionTranscript =
      activeMissionId !== null &&
      missionIdRef.current === activeMissionId &&
      initialMissionData?.missionId !== activeMissionId &&
      (!Array.isArray(initialMessageInfos) || initialMessageInfos.length === 0) &&
      sessionMessagesRef.current.length > 0;
    const nextTranscriptMessages = shouldPreserveStartedMissionTranscript
      ? sessionMessagesRef.current
      : getInitialTranscriptMessages(
          activeMissionId,
          initialMissionData,
          initialMessageInfos,
          initialMessages,
          pendingMissionMessages,
          primaryAgentId,
          transcriptMode,
        );

    noctisSessionIdRef.current = nextPrimarySessionId;
    setNoctisSessionId(nextPrimarySessionId);
    setWorkerSessionIds(initialWorkerSessionIds);
    setDelegationLedger(null);
    clearStreamingState();
    replaceSessionMessages(nextTranscriptMessages);
    setTranscriptState(
      shouldPreserveStartedMissionTranscript
        ? createMissionTranscriptState(activeMissionId, "loading", null, nextPrimarySessionId)
        : getInitialTranscriptState(
            activeMissionId,
            initialMissionData,
            initialMessageInfos,
            initialMessages,
            pendingMissionMessages,
            primaryAgentId,
            transcriptMode,
          )
    );
    clearAbortSettlement();
    hasHydratedNoctisSettledRef.current = false;
    lastNoctisSettledRef.current = false;
    lastNoctisSettledEmitAtRef.current = null;
    runtimePrimaryFreshnessKeyRef.current = null;
    sessionHistorySyncInFlightRef.current.clear();
    sessionHistorySyncQueuedRef.current.clear();
    loadMissionHydrationInFlightRef.current.clear();
    completedLoadMissionHydrationKeysRef.current.clear();
    setIsStreaming(false);
    lastSessionStateRef.current = null;
    lastWorkerSessionStatesRef.current = createInitialWorkerSessionStates();
    sessionStatusRef.current = initialNoctisSessionId
      ? (useChatStore.getState().sessionStates[initialNoctisSessionId] ?? null)
      : null;
    setPartyRuntime(createInitialPartyRuntimeState());
  }, [
    activeMissionId,
    closeWorkerEventSources,
    initialMessageInfos,
    initialMessages,
    initialMissionData,
    initialNoctisSessionId,
    initialWorkerSessionIds,
    pendingMissionMessages,
    primaryAgentId,
    transcriptMode,
    clearAbortSettlement,
    clearStreamingState,
    replaceSessionMessages,
  ]);

  const scheduleIdleReset = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(() => {
      setPartyRuntime(createInitialPartyRuntimeState());
    }, 2500);
  }, []);

  const syncSessionMessages = useCallback(
    async (
      sessionId: string,
      options?: SessionHistorySyncOptions,
    ) => {
      const transcriptMissionId =
        options?.missionId ?? missionIdRef.current ?? activeMissionIdRef.current;

      const syncStartedAt = Date.now();

      try {
        const nextMessages = await loadSessionMessages(sessionId, primaryAgentId, transcriptMode);
        const currentStreamingMessageId = streamingMessageIdRef.current;
        const latestAssistant = [...nextMessages]
          .reverse()
          .find((message) => message.sender === primaryAgentId);
        const shouldKeepPendingTrackedReply = Boolean(
          options?.trackStreamingMessage &&
            !currentStreamingMessageId &&
            ((latestAssistant?.id ?? null) === (options.expectedLatestAssistantMessageId ?? null) ||
              nextMessages.length === 0),
        );
        const containsStreamingMessageId = Boolean(
          currentStreamingMessageId &&
            nextMessages.some((message) => message.id === currentStreamingMessageId)
        );
        const shouldClearSyncedLiveTail = Boolean(
          currentStreamingMessageId && containsStreamingMessageId,
        );
        const hasAuthoritativeHistory = nextMessages.length > 0;
        const effectiveSessionStatus =
          useChatStore.getState().sessionStates[sessionId] ?? sessionStatusRef.current;

        if (transcriptMissionId && hasAuthoritativeHistory) {
          clearPendingMissionMessages(transcriptMissionId);
        }

        const remainingPendingMissionMessages = transcriptMissionId
          ? (hasAuthoritativeHistory
              ? []
              : (useChatStore.getState().pendingMissionMessages[transcriptMissionId] ?? []))
          : [];

        const shouldPreserveCurrentMessages =
          shouldKeepPendingTrackedReply ||
          (nextMessages.length === 0 && (options?.preserveStreaming || options?.trackStreamingMessage));

        const retainedMessages = shouldPreserveCurrentMessages
          ? sessionMessagesRef.current
          : replaceSessionMessages(
              nextMessages.length === 0
                ? (transcriptMissionId ? [] : initialMessages)
                : options?.preserveStreaming
                  ? mergeRuntimeSessionMessages(
                      sessionMessagesRef.current,
                      nextMessages,
                      primaryAgentId,
                    )
                  : nextMessages,
            );

        setTranscriptState(
          shouldKeepPendingTrackedReply
            ? createMissionTranscriptState(transcriptMissionId, "pending", null, sessionId)
            : nextMessages.length === 0 && remainingPendingMissionMessages.length > 0
              ? createMissionTranscriptState(transcriptMissionId, "loading", null, sessionId)
            : createMissionTranscriptState(
                transcriptMissionId,
                resolveMissionTranscriptPhase(retainedMessages),
              )
        );

        if (shouldClearSyncedLiveTail) {
          clearStreamingState();
        } else if (
          !options?.trackStreamingMessage &&
          currentStreamingMessageId &&
          !isSessionStatusActive(effectiveSessionStatus)
        ) {
          clearStreamingState();
        }

        appendMissionClientDebugLog({
          event: "session-history-sync",
          stage: "completed",
          missionId: transcriptMissionId,
          missionRouteBase,
          sessionId,
          payload: {
            durationMs: Date.now() - syncStartedAt,
            effectiveSessionStatus,
            expectedLatestAssistantMessageId: options?.expectedLatestAssistantMessageId ?? null,
            keptPendingTrackedReply: shouldKeepPendingTrackedReply,
            messageCount: nextMessages.length,
            preserveStreaming: Boolean(options?.preserveStreaming),
            reason: options?.reason ?? "unspecified",
            trackStreamingMessage: Boolean(options?.trackStreamingMessage),
          },
        });

        if (!options?.trackStreamingMessage) {
          return;
        }

        streamingMessageIdRef.current = shouldKeepPendingTrackedReply ? null : (latestAssistant?.id ?? null);
      } catch (error) {
        appendMissionClientDebugLog({
          event: "session-history-sync",
          stage: "failed",
          missionId: transcriptMissionId,
          missionRouteBase,
          sessionId,
          payload: {
            durationMs: Date.now() - syncStartedAt,
            error,
            reason: options?.reason ?? "unspecified",
          },
        });
        throw error;
      }
    },
    [
      clearStreamingState,
      clearPendingMissionMessages,
      initialMessages,
      missionRouteBase,
      primaryAgentId,
      replaceSessionMessages,
      transcriptMode,
    ]
  );

  const requestSessionHistorySync = useCallback(
    (sessionId: string, options?: SessionHistorySyncOptions) => {
      if (sessionHistorySyncInFlightRef.current.has(sessionId)) {
        sessionHistorySyncQueuedRef.current.set(
          sessionId,
          mergeSessionHistorySyncOptions(
            sessionHistorySyncQueuedRef.current.get(sessionId),
            options,
          ),
        );
        return;
      }

      sessionHistorySyncInFlightRef.current.add(sessionId);

      void (async () => {
        let nextOptions = options;

        while (true) {
          try {
            await syncSessionMessages(sessionId, nextOptions);
          } catch {
            // Fire-and-forget sync requests should not surface errors to the UI.
          }

          const queuedOptions = sessionHistorySyncQueuedRef.current.get(sessionId);
          if (!queuedOptions) {
            break;
          }

          sessionHistorySyncQueuedRef.current.delete(sessionId);
          nextOptions = queuedOptions;
        }

        sessionHistorySyncInFlightRef.current.delete(sessionId);
      })();
    },
    [syncSessionMessages],
  );

  const ensureLoadMissionHistoryHydrated = useCallback(
    (missionId: string, sessionId: string, invocationId: number, signature: string) => {
      const hydrationKey = `${missionId}:${sessionId}`;
      if (completedLoadMissionHydrationKeysRef.current.has(hydrationKey)) {
        appendMissionClientDebugLog({
          event: "mission-load",
          stage: "observed",
          missionId,
          missionRouteBase,
          sessionId,
          payload: {
            phase: "hydrate-decision",
            hydrateDecision: "skip-completed-same-key",
            hydrateKey: hydrationKey,
            invocationId,
            signature,
          },
        });
        return Promise.resolve();
      }

      const inFlightHydration = loadMissionHydrationInFlightRef.current.get(hydrationKey);
      if (inFlightHydration) {
        appendMissionClientDebugLog({
          event: "mission-load",
          stage: "observed",
          missionId,
          missionRouteBase,
          sessionId,
          payload: {
            phase: "hydrate-decision",
            hydrateDecision: "reuse-inflight",
            hydrateKey: hydrationKey,
            invocationId,
            signature,
          },
        });
        return inFlightHydration;
      }

      appendMissionClientDebugLog({
        event: "mission-load",
        stage: "observed",
        missionId,
        missionRouteBase,
        sessionId,
        payload: {
          phase: "hydrate-decision",
          hydrateDecision: "start",
          hydrateKey: hydrationKey,
          invocationId,
          signature,
        },
      });

      const hydrationPromise = syncSessionMessages(sessionId, {
        missionId,
        reason: "load-mission-initial-hydrate",
      }).then(() => {
        completedLoadMissionHydrationKeysRef.current.add(hydrationKey);
      }).finally(() => {
        loadMissionHydrationInFlightRef.current.delete(hydrationKey);
      });

      loadMissionHydrationInFlightRef.current.set(hydrationKey, hydrationPromise);
      return hydrationPromise;
    },
    [syncSessionMessages, missionRouteBase],
  );

  const handleAgentEvent = useCallback(
    (event: AgentEvent | StreamAgentEvent) => {
      if (event.type === "message.part.updated") {
        const { text } = event;
        const eventMessageId = "messageId" in event ? event.messageId : undefined;
        const eventPart = "part" in event ? event.part : undefined;
        const eventSessionId =
          ("sessionId" in event ? event.sessionId : undefined) ?? noctisSessionIdRef.current;
        if (!text && !eventPart) return;

        setIsStreaming(true);
        if (noctisSessionIdRef.current) {
          setOptimisticSessionState(noctisSessionIdRef.current, "busy", 4000);
        }
        const previousStreamingMessageId = streamingMessageIdRef.current;
        const nextStreamingMessageId = eventMessageId ?? previousStreamingMessageId;
        streamingMessageIdRef.current = nextStreamingMessageId ?? null;

        if (nextStreamingMessageId) {
          const nextPart = eventPart ?? (text ? { type: "text", text } : null);
          if (nextPart) {
            setLiveDraft((current) =>
              mergeSessionLiveDraft(current, {
                kind: "part",
                messageId: nextStreamingMessageId,
                part: nextPart,
                sessionId: eventSessionId ?? null,
              }),
            );
          }
        }

        if (text) {
          setStreamingContent((current) =>
            mergeStreamingText(
              nextStreamingMessageId &&
                previousStreamingMessageId &&
                nextStreamingMessageId !== previousStreamingMessageId
                ? ""
                : current,
              text,
            ),
          );
        }
        return;
      }

      if (event.type === "session.completed") {
        setIsStreaming(false);
        clearStreamingState();
        clearProgressBanter();
        scheduleIdleReset();
      }

      const update = eventToPartyUpdate(event, primaryAgentId);
      if (update) {
        if (!isLunafreyaSurface) {
          setPartyRuntime((prev) => applyPartyRuntimeUpdate(prev, update));
        }
        if (update.cue && update.speakerAgent) {
          void persistAmbientBanter({
            speakerAgent: update.speakerAgent,
            cue: update.cue,
            sourceEvent: event.type,
          });
        }
      }
    },
    [
      clearProgressBanter,
      clearStreamingState,
      isLunafreyaSurface,
      primaryAgentId,
      persistAmbientBanter,
      scheduleIdleReset,
      setOptimisticSessionState,
    ]
  );

  const _scheduleProgressBanter = useCallback(
    (agentId: string) => {
      const normalized = normalizeBanterAgentId(agentId);
      if (!normalized) {
        return;
      }

      clearProgressBanter(normalized);
      progressTimersRef.current[normalized] = {
        early: setTimeout(() => {
          if (!isSessionStatusActive(sessionStatusRef.current)) {
            return;
          }
          handleAgentEvent({ type: "task.progress", agentId: normalized, stage: "early" });
        }, PROGRESS_BANTER_DELAYS.early),
        late: setTimeout(() => {
          if (!isSessionStatusActive(sessionStatusRef.current)) {
            return;
          }
          handleAgentEvent({ type: "task.progress", agentId: normalized, stage: "late" });
        }, PROGRESS_BANTER_DELAYS.late),
      };
    },
    [clearProgressBanter, handleAgentEvent]
  );

  const subscribeToSession = useCallback(
    (sessionId: string) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      setIsPrimaryStreamConnected(false);
      const es = new EventSource(`/api/session/${sessionId}/events`);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsPrimaryStreamConnected(true);
      };

      es.onmessage = (e: MessageEvent) => {
        setIsPrimaryStreamConnected(true);
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(e.data) as Record<string, unknown>;
        } catch {
          return;
        }

        const liveEvent = parseSessionLiveEvent(parsed);
        if (liveEvent?.kind === "part") {
          handleAgentEvent({
            type: "message.part.updated",
            messageId: liveEvent.messageId ?? undefined,
            sessionId: liveEvent.sessionId ?? undefined,
            text: liveEvent.part.type === "text" ? liveEvent.part.text : undefined,
          });
          return;
        }

        if (liveEvent?.kind === "idle") {
          const activeSessionId = liveEvent.sessionId ?? noctisSessionIdRef.current;
          if (activeSessionId) {
            appendMissionClientDebugLog({
              event: "primary-session-idle",
              stage: "observed",
              missionId: missionIdRef.current ?? activeMissionIdRef.current,
              missionRouteBase,
              sessionId: activeSessionId,
              payload: {
                lastSessionState: lastSessionStateRef.current,
                hadStreamingMessage: Boolean(streamingMessageIdRef.current),
              },
            });
            setServerSessionState(activeSessionId, "idle");
            lastSessionStateRef.current = "idle";
            sessionStatusRef.current = "idle";
            clearAbortSettlement();
            requestSessionHistorySync(activeSessionId, {
              reason: "primary-idle-event",
            });
          }
          streamingMessageIdRef.current = null;
          handleAgentEvent({ type: "session.completed", message: "" });
          return;
        }

        if (liveEvent?.kind === "status") {
          const nextStatus = coerceSessionStatus(liveEvent.status);
          const activeSessionId = liveEvent.sessionId ?? noctisSessionIdRef.current;
          if (nextStatus && activeSessionId) {
            setServerSessionState(activeSessionId, nextStatus);
            sessionStatusRef.current = nextStatus;
            if (nextStatus === "idle") {
              clearAbortSettlement();
            }
            if (nextStatus === "retry" && lastSessionStateRef.current !== "retry") {
              clearProgressBanter(primaryAgentId);
              handleAgentEvent({ type: "task.retrying", agentId: primaryAgentId });
            }
            lastSessionStateRef.current = nextStatus;
          }
          return;
        }
      };

      es.onerror = () => {
        setIsPrimaryStreamConnected(false);
        setIsStreaming(false);
        clearProgressBanter();
        void refreshMissionRuntimeRef.current?.();
      };
    },
    [
      clearAbortSettlement,
      clearProgressBanter,
      handleAgentEvent,
      missionRouteBase,
      primaryAgentId,
      requestSessionHistorySync,
      setServerSessionState,
    ]
  );

  const subscribeToWorkerSessions = useCallback(
    (sessions: WorkerSessionIds) => {
      closeWorkerEventSources();

      for (const worker of WORKER_PARTY_MEMBERS) {
        const agentId = worker.id;
        const sessionId = sessions[agentId];
        if (!sessionId) {
          lastWorkerSessionStatesRef.current[agentId] = null;
          continue;
        }

        const es = new EventSource(`/api/session/${sessionId}/events`);
        workerEventSourcesRef.current[agentId] = es;

        es.onmessage = (event: MessageEvent) => {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(event.data) as Record<string, unknown>;
          } catch {
            return;
          }

          const type = parsed.type;
          if (typeof type !== "string") {
            return;
          }

          if (type === "session.idle") {
            setServerSessionState(sessionId, "idle");
            lastWorkerSessionStatesRef.current[agentId] = "idle";
            return;
          }

          if (type === "session.status") {
            const props = parsed.properties as Record<string, unknown> | undefined;
            const status = props?.status as Record<string, unknown> | undefined;
            const nextStatus = coerceSessionStatus(status?.type);
            if (!nextStatus) {
              return;
            }

            setServerSessionState(sessionId, nextStatus);
            if (nextStatus === "retry" && lastWorkerSessionStatesRef.current[agentId] !== "retry") {
              handleAgentEvent({ type: "task.retrying", agentId });
            }
            lastWorkerSessionStatesRef.current[agentId] = nextStatus;
          }
        };

        es.onerror = () => {
          // Keep the last known server state until the next successful event.
        };
      }
    },
    [closeWorkerEventSources, handleAgentEvent, setServerSessionState]
  );

  const applyMissionRuntimeSnapshot = useCallback(
    (runtime: MissionRuntimeSnapshot) => {
      const delegationLedger = normalizeDelegationLedger(runtime.missionId, runtime.delegationLedger);

      missionIdRef.current = runtime.missionId;
      setActiveOperationState((current) =>
        areOperationStatesEqual(current, runtime.operationState ?? null)
          ? current
          : (runtime.operationState ?? null),
      );
      setWorkflowProgress((current) =>
        areWorkflowProgressEqual(current, runtime.workflowProgress ?? null)
          ? current
          : (runtime.workflowProgress ?? null),
      );
      setActivityLog((current) =>
        areMissionActivityLogsEqual(current, runtime.activityLog ?? [])
          ? current
          : (runtime.activityLog ?? []),
      );
      setSelectedOperation((current) => {
        const nextSelectedOperation = runtime.operationState?.operationRef ?? null;
        return current === nextSelectedOperation ? current : nextSelectedOperation;
      });

      const currentPrimarySessionId = noctisSessionIdRef.current;
      const nextPrimarySessionId = getMissionPrimarySessionIdFromPayload(runtime);
      const previousPrimaryFreshnessKey = runtimePrimaryFreshnessKeyRef.current;
      const nextPrimaryFreshnessKey = getRuntimePrimaryFreshnessKey({
        latestPrimaryMessageCreatedAt: runtime.latestPrimaryMessageCreatedAt,
        latestPrimaryMessageId: runtime.latestPrimaryMessageId,
        primarySessionId: nextPrimarySessionId,
      });
      const runtimePrimaryStatus = nextPrimarySessionId
        ? (runtime.sessionStatuses[nextPrimarySessionId] ?? null)
        : null;
      const optimisticPrimaryStatus = nextPrimarySessionId
        ? (useChatStore.getState().optimisticSessionStates[nextPrimarySessionId] ?? null)
        : null;
      const shouldPreservePrimaryActive =
        isSessionStatusActive(optimisticPrimaryStatus) ||
        isSessionStatusActive(runtimePrimaryStatus) ||
        pendingMissionSessionId === nextPrimarySessionId ||
        isStreaming;
      const hasActiveDelegation = delegationLedger.activeTasks.some(
        (task) => task.status === "pending" || task.status === "running"
      );
      const activeTaskCount = delegationLedger.activeTasks.length;
      const runningTaskCount = delegationLedger.activeTasks.filter(
        (task) => task.status === "pending" || task.status === "running",
      ).length;
      const isPrimarySettled = !shouldPreservePrimaryActive && !hasActiveDelegation;
      const previousSettled = lastNoctisSettledRef.current;
      const hasHydratedSettled = hasHydratedNoctisSettledRef.current;
      const isSettledBanterCoolingDown =
        lastNoctisSettledEmitAtRef.current !== null &&
        Date.now() - lastNoctisSettledEmitAtRef.current < MISSION_SETTLED_BANTER_COOLDOWN_MS;
      const shouldEmitSettled =
        hasHydratedSettled &&
        isPrimarySettled &&
        !previousSettled &&
        !isSettledBanterCoolingDown;

      appendMissionClientDebugLog({
        event: "settled-evaluation",
        stage: "observed",
        missionId: runtime.missionId,
        missionRouteBase,
        sessionId: nextPrimarySessionId,
        payload: {
          activeTaskCount,
          hasHydratedSettled,
          nextSettled: isPrimarySettled,
          optimisticPrimaryStatus,
          pendingMissionSessionId,
          previousSettled,
          runningTaskCount,
          runtimePrimaryStatus,
          settledCooldownActive: isSettledBanterCoolingDown,
          shouldEmitSettled,
          shouldPreservePrimaryActive,
        },
      });

      clearPendingMissionSession(runtime.missionId);

      const shouldResyncPendingTranscriptFromRuntime = Boolean(
        nextPrimarySessionId &&
          currentPrimarySessionId === nextPrimarySessionId &&
          isPrimarySettled &&
          transcriptStateRef.current.phase === "pending" &&
          transcriptStateRef.current.missionId === runtime.missionId &&
          transcriptStateRef.current.sessionId === nextPrimarySessionId,
      );
      const shouldResyncTranscriptFromRuntimeFreshness = Boolean(
        nextPrimarySessionId &&
          currentPrimarySessionId === nextPrimarySessionId &&
          previousPrimaryFreshnessKey !== null &&
          previousPrimaryFreshnessKey !== nextPrimaryFreshnessKey &&
          transcriptStateRef.current.missionId === runtime.missionId,
      );

      runtimePrimaryFreshnessKeyRef.current = nextPrimaryFreshnessKey;

      if (noctisSessionIdRef.current !== nextPrimarySessionId) {
        const transcriptMissionId = runtime.missionId ?? activeMissionIdRef.current;
        const shouldClearVisibleTranscriptOnSessionSwitch =
          transcriptStateRef.current.missionId === transcriptMissionId &&
          transcriptStateRef.current.phase !== "ready";
        noctisSessionIdRef.current = nextPrimarySessionId;
        setNoctisSessionId(nextPrimarySessionId);
        clearStreamingState();
        if (nextPrimarySessionId) {
          if (shouldClearVisibleTranscriptOnSessionSwitch) {
            replaceSessionMessages([]);
          }
          setTranscriptState(createMissionTranscriptState(transcriptMissionId, "loading"));
          subscribeToSession(nextPrimarySessionId);
          void syncSessionMessages(nextPrimarySessionId, {
            missionId: transcriptMissionId,
            reason: "runtime-primary-session-switch",
          }).catch(() => {
            setTranscriptState(
              createMissionTranscriptState(
                transcriptMissionId,
                "error",
                "Unable to load mission transcript.",
              )
            );
          });
        } else {
          eventSourceRef.current?.close();
          eventSourceRef.current = null;
          setIsPrimaryStreamConnected(false);
          replaceSessionMessages([]);
          clearStreamingState();
          setTranscriptState(createMissionTranscriptState(transcriptMissionId, "empty"));
        }
      } else {
        setNoctisSessionId((current) => current ?? nextPrimarySessionId);
        if (nextPrimarySessionId && !eventSourceRef.current) {
          subscribeToSession(nextPrimarySessionId);
        }
      }

      if (shouldResyncPendingTranscriptFromRuntime && nextPrimarySessionId) {
        requestSessionHistorySync(nextPrimarySessionId, {
          missionId: runtime.missionId,
          preserveStreaming: true,
          reason: "runtime-primary-settled-sync",
        });
      }

      if (shouldResyncTranscriptFromRuntimeFreshness && nextPrimarySessionId) {
        requestSessionHistorySync(nextPrimarySessionId, {
          missionId: runtime.missionId,
          preserveStreaming: true,
          reason: "runtime-primary-freshness-sync",
        });
      }

      setWorkerSessionIds((current) => {
        const nextWorkerSessionIds = toWorkerSessionIds(runtime.sessions);
        return areWorkerSessionIdsEqual(current, nextWorkerSessionIds)
          ? current
          : nextWorkerSessionIds;
      });
      setDelegationLedger((current) =>
        areDelegationLedgersEqual(current, delegationLedger) ? current : delegationLedger,
      );
      syncPersistedBanterTimeline(runtime.banterTimeline ?? []);
      if (!hasHydratedNoctisSettledRef.current) {
        hasHydratedNoctisSettledRef.current = true;
        lastNoctisSettledRef.current = isPrimarySettled;
      } else if (isPrimarySettled && !lastNoctisSettledRef.current) {
        if (!isSettledBanterCoolingDown) {
          void persistAmbientBanter({
            speakerAgent: primaryAgentId,
            cue: "session-settled",
            sourceEvent: "session.settled",
          });
          appendMissionClientDebugLog({
            event: "session-settled-emitted",
            stage: "observed",
            missionId: runtime.missionId,
            missionRouteBase,
            sessionId: nextPrimarySessionId,
            payload: {
              previousSettled,
              runtimePrimaryStatus,
              shouldPreservePrimaryActive,
            },
          });
          lastNoctisSettledEmitAtRef.current = Date.now();
        }
        lastNoctisSettledRef.current = true;
      } else {
        lastNoctisSettledRef.current = isPrimarySettled;
      }
      const nextContextUsageByAgent = {
        noctis: runtime.contextUsageByAgent?.noctis ?? null,
        lunafreya: runtime.contextUsageByAgent?.lunafreya ?? null,
        ignis: runtime.contextUsageByAgent?.ignis ?? null,
        gladiolus: runtime.contextUsageByAgent?.gladiolus ?? null,
        prompto: runtime.contextUsageByAgent?.prompto ?? null,
      };
      setContextUsageByAgent((current) =>
        areContextUsageByAgentEqual(current, nextContextUsageByAgent)
          ? current
          : nextContextUsageByAgent,
      );

      const nextPrimaryStatus = runtimePrimaryStatus;

      if (nextPrimarySessionId && nextPrimaryStatus) {
        setServerSessionState(nextPrimarySessionId, nextPrimaryStatus);
        sessionStatusRef.current = nextPrimaryStatus;
        if (nextPrimaryStatus === "idle") {
          clearAbortSettlement();
        }
      } else if (shouldPreservePrimaryActive) {
      } else if (nextPrimarySessionId) {
        setServerSessionState(nextPrimarySessionId, "idle");
        sessionStatusRef.current = "idle";
        clearAbortSettlement();
      } else {
        sessionStatusRef.current = null;
        clearAbortSettlement();
      }

      const nextWorkerSessionIds = toWorkerSessionIds(runtime.sessions);
      for (const worker of WORKER_PARTY_MEMBERS) {
        const sessionId = nextWorkerSessionIds[worker.id];
        if (!sessionId) {
          continue;
        }

        const nextStatus = runtime.sessionStatuses[sessionId];
        setServerSessionState(sessionId, nextStatus ?? "idle");
      }
    },
    [
      clearPendingMissionSession,
      clearAbortSettlement,
      isStreaming,
      missionRouteBase,
      pendingMissionSessionId,
      persistAmbientBanter,
      primaryAgentId,
      requestSessionHistorySync,
      setServerSessionState,
      subscribeToSession,
      syncSessionMessages,
      syncPersistedBanterTimeline,
      clearStreamingState,
      replaceSessionMessages,
    ]
  );

  const refreshMissionRuntime = useCallback(async () => {
    if (!activeMissionId) {
      return;
    }

    if (runtimeRefreshInFlightRef.current) {
      runtimeRefreshQueuedRef.current = true;
      return;
    }

    runtimeRefreshInFlightRef.current = true;

    try {
      const runtime = await loadMissionRuntimeSnapshot(activeMissionId, missionRouteBase);
      if (runtime.missionId !== activeMissionIdRef.current) {
        return;
      }

      applyMissionRuntimeSnapshot(runtime);
    } catch {
      // Ignore transient mission runtime failures.
    } finally {
      runtimeRefreshInFlightRef.current = false;

      if (runtimeRefreshQueuedRef.current) {
        runtimeRefreshQueuedRef.current = false;
        void refreshMissionRuntimeRef.current?.();
      }
    }
  }, [activeMissionId, applyMissionRuntimeSnapshot, missionRouteBase]);

  useEffect(() => {
    applyMissionRuntimeSnapshotRef.current = applyMissionRuntimeSnapshot;
  }, [applyMissionRuntimeSnapshot]);

  useEffect(() => {
    refreshMissionRuntimeRef.current = refreshMissionRuntime;

    return () => {
      if (refreshMissionRuntimeRef.current === refreshMissionRuntime) {
        refreshMissionRuntimeRef.current = null;
      }
    };
  }, [refreshMissionRuntime]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState !== "hidden";
      setIsDocumentVisible(visible);

      if (visible) {
        void refreshMissionRuntimeRef.current?.();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      closeWorkerEventSources();
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      if (abortSettlementTimerRef.current) {
        clearTimeout(abortSettlementTimerRef.current);
      }
      banterFeedPresenterRef.current?.dispose();
      clearProgressBanter();
    };
  }, [clearProgressBanter, closeWorkerEventSources]);

  useEffect(() => {
    subscribeToWorkerSessions(workerSessionIds);
  }, [subscribeToWorkerSessions, workerSessionIds]);

  useEffect(() => {
    if (!activeMissionId) {
      return;
    }

    const hasActiveDelegation =
      delegationLedger?.activeTasks.some(
        (task) => task.status === "pending" || task.status === "running",
      ) ?? false;
    let cancelled = false;
    let timeoutId: number | null = null;

    const scheduleNextRefresh = () => {
      if (cancelled) {
        return;
      }

      timeoutId = window.setTimeout(async () => {
        await refreshMissionRuntime();
        scheduleNextRefresh();
      },
      getMissionRuntimePollInterval({
        abortSettlementPhase,
        hasActiveDelegation,
        hasPendingTranscript: transcriptStateRef.current.phase === "pending",
        isDocumentVisible,
        isPrimaryStreamConnected,
        isSessionActive,
        isStreaming,
      }));
    };

    scheduleNextRefresh();

    return () => {
      cancelled = true;
      runtimeRefreshQueuedRef.current = false;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    abortSettlementPhase,
    activeMissionId,
    delegationLedger,
    isDocumentVisible,
    isPrimaryStreamConnected,
    isSessionActive,
    isStreaming,
    refreshMissionRuntime,
  ]);

  useEffect(() => {
    const loadMission = async () => {
      if (!activeMissionId) {
        missionIdRef.current = null;
        noctisSessionIdRef.current = null;
        hasHydratedNoctisSettledRef.current = false;
        lastNoctisSettledRef.current = false;
        lastNoctisSettledEmitAtRef.current = null;
        lastLoadMissionSignatureRef.current = null;
        banterTimelineMissionIdRef.current = null;
        setNoctisSessionId(null);
        setActiveOperationState(null);
        setWorkflowProgress(null);
        setActivityLog([]);
        setSelectedOperation(null);
        setWorkerSessionIds(createInitialWorkerSessionIds());
        setDelegationLedger(null);
        setContextUsageByAgent(createInitialContextUsageByAgent());
        clearAbortSettlement();
        clearStreamingState();
        replaceSessionMessages(initialMessages);
        setTranscriptState(createMissionTranscriptState(null, "idle"));
        clearBanterEntries();
        setPartyRuntime(createInitialPartyRuntimeState());
        sessionHistorySyncInFlightRef.current.clear();
        sessionHistorySyncQueuedRef.current.clear();
        loadMissionHydrationInFlightRef.current.clear();
        completedLoadMissionHydrationKeysRef.current.clear();
        setIsStreaming(false);
        lastSessionStateRef.current = null;
        lastWorkerSessionStatesRef.current = createInitialWorkerSessionStates();
        sessionStatusRef.current = null;
        clearProgressBanter();
        replaceServerSessionStates({});
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
        closeWorkerEventSources();
        return;
      }

      try {
        if (banterTimelineMissionIdRef.current !== activeMissionId) {
          clearBanterEntries();
          banterTimelineMissionIdRef.current = activeMissionId;
        }

        const hasPreloadedMessages =
          initialMissionData?.missionId === activeMissionId &&
          Array.isArray(initialMessageInfos) &&
          initialMessageInfos.length > 0;
        const initialPrimarySessionId =
          initialMissionData?.missionId === activeMissionId
            ? getMissionPrimarySessionIdFromPayload(initialMissionData)
            : null;
        const pendingPrimarySessionId = activeMissionId
          ? (useChatStore.getState().pendingMissionSessions[activeMissionId] ?? null)
          : null;
        const immediatePrimarySessionId =
          initialPrimarySessionId ?? pendingPrimarySessionId ?? initialNoctisSessionId;
        const signature = JSON.stringify({
          activeMissionId,
          initialMessageCount: Array.isArray(initialMessageInfos) ? initialMessageInfos.length : 0,
          initialMissionDataId: initialMissionData?.missionId ?? null,
          initialNoctisSessionId,
          initialPrimarySessionId,
          pendingPrimarySessionId,
        });
        const previousSignature = lastLoadMissionSignatureRef.current;
        const invocationId = loadMissionInvocationIdRef.current + 1;
        loadMissionInvocationIdRef.current = invocationId;
        const loadReason =
          previousSignature === null
            ? "mission-changed"
            : previousSignature === signature
              ? "same-signature-rerun"
              : "initial-payload-changed";
        lastLoadMissionSignatureRef.current = signature;

        appendMissionClientDebugLog({
          event: "mission-load",
          stage: "observed",
          missionId: activeMissionId,
          missionRouteBase,
          sessionId: immediatePrimarySessionId,
          payload: {
            hasPreloadedMessages,
            immediatePrimarySessionId,
            initialPrimarySessionId,
            invocationId,
            pendingPrimarySessionId,
            phase: "start",
            previousSignature,
            reason: loadReason,
            signature,
          },
        });

        if (immediatePrimarySessionId) {
          subscribeToSession(immediatePrimarySessionId);
        }

        if (initialMissionData?.missionId === activeMissionId) {
          missionIdRef.current = initialMissionData.missionId;
          clearPendingMissionSession(initialMissionData.missionId);
          noctisSessionIdRef.current = initialPrimarySessionId;
          setNoctisSessionId(initialPrimarySessionId);
          setActiveOperationState(initialMissionData.operationState ?? null);
          setWorkflowProgress(initialMissionData.workflowProgress ?? null);
          setActivityLog(initialMissionData.activityLog ?? []);
          setSelectedOperation(initialMissionData.operationState?.operationRef ?? null);
          setWorkerSessionIds(toWorkerSessionIds(initialMissionData.sessions));
          setContextUsageByAgent(createInitialContextUsageByAgent());
          if (hasPreloadedMessages) {
            clearPendingMissionMessages(activeMissionId);
            const preloadedMessages = replaceSessionMessages(
              toSessionChatMessages(initialMessageInfos ?? [], primaryAgentId),
            );
            setTranscriptState(
              createMissionTranscriptState(
                activeMissionId,
                resolveMissionTranscriptPhase(preloadedMessages),
              )
            );
          }
        }

        setPartyRuntime(createInitialPartyRuntimeState());
        setIsStreaming(false);
        lastSessionStateRef.current = null;
        lastWorkerSessionStatesRef.current = createInitialWorkerSessionStates();
        sessionStatusRef.current = null;
        clearProgressBanter();

        const runtime = await loadMissionRuntimeSnapshot(activeMissionId, missionRouteBase);
        applyMissionRuntimeSnapshotRef.current?.(runtime);

        const primarySessionId = getMissionPrimarySessionIdFromPayload(runtime);
        if (primarySessionId) {
          const shouldHydrateHistory = !(
            hasPreloadedMessages &&
            initialPrimarySessionId === primarySessionId
          );

          if (shouldHydrateHistory) {
            setTranscriptState(createMissionTranscriptState(activeMissionId, "loading"));
            await ensureLoadMissionHistoryHydrated(
              activeMissionId,
              primarySessionId,
              invocationId,
              signature,
            );
          } else {
            appendMissionClientDebugLog({
              event: "mission-load",
              stage: "observed",
              missionId: activeMissionId,
              missionRouteBase,
              sessionId: primarySessionId,
              payload: {
                hydrateDecision: "skip-preloaded",
                hydrateKey: `${activeMissionId}:${primarySessionId}`,
                invocationId,
                phase: "hydrate-decision",
                signature,
              },
            });
          }
        } else {
          appendMissionClientDebugLog({
            event: "mission-load",
            stage: "observed",
            missionId: activeMissionId,
            missionRouteBase,
            payload: {
              hydrateDecision: "no-primary-session",
              invocationId,
              phase: "hydrate-decision",
              signature,
            },
          });
          replaceSessionMessages([]);
          clearStreamingState();
          setTranscriptState(createMissionTranscriptState(activeMissionId, "empty"));
        }
      } catch {
        missionIdRef.current = null;
        noctisSessionIdRef.current = null;
        hasHydratedNoctisSettledRef.current = false;
        lastNoctisSettledRef.current = false;
        lastNoctisSettledEmitAtRef.current = null;
        lastLoadMissionSignatureRef.current = null;
        setNoctisSessionId(null);
        setActiveOperationState(null);
        setWorkflowProgress(null);
        setActivityLog([]);
        setSelectedOperation(null);
        setWorkerSessionIds(createInitialWorkerSessionIds());
        setDelegationLedger(null);
        setContextUsageByAgent(createInitialContextUsageByAgent());
        replaceSessionMessages([]);
        clearStreamingState();
        setTranscriptState(
          createMissionTranscriptState(
            activeMissionId,
            "error",
            "Unable to load mission transcript.",
          )
        );
        sessionHistorySyncInFlightRef.current.clear();
        sessionHistorySyncQueuedRef.current.clear();
        loadMissionHydrationInFlightRef.current.clear();
        completedLoadMissionHydrationKeysRef.current.clear();
        sessionStatusRef.current = null;
        clearProgressBanter();
        replaceServerSessionStates({});
        closeWorkerEventSources();
      }
    };

    void loadMission();
  }, [
    activeMissionId,
    clearBanterEntries,
    clearPendingMissionSession,
    clearPendingMissionMessages,
    clearProgressBanter,
    closeWorkerEventSources,
    initialMessages,
    initialMessageInfos,
    initialMissionData,
    initialNoctisSessionId,
    ensureLoadMissionHistoryHydrated,
    missionRouteBase,
    primaryAgentId,
    replaceServerSessionStates,
    subscribeToSession,
    clearAbortSettlement,
    clearStreamingState,
    replaceSessionMessages,
  ]);

  const send = useCallback(
    async (parts: PromptPart[]) => {
      const text = stringifyPromptParts(parts);
      const expectedLatestAssistantMessageId = getLatestAssistantMessageId(
        sessionMessages,
        primaryAgentId,
      );
      if (
        activeMissionId &&
        visibleTranscriptState.phase === "loading"
      ) {
        return null;
      }

      const userMessage: ChatMessage = {
        id: createId(),
        sender: "user",
        actor: "user",
        speaker: "user",
        kind: "user_message",
        content: text,
        detailContent: text,
        rawText: text,
        parts: [{ type: "text", text }],
        timestamp: new Date(),
        source: "session",
      };
      updateSessionMessages((prev) => [...prev, userMessage]);
      clearStreamingState();

      const agentModels = useChatStore.getState().agentModels;
      const allowedWorkers = getAllowedWorkers(useChatStore.getState().workingParty);

      try {
        if (!missionIdRef.current) {
          if (!selectedExecutionProjectId) {
            throw new Error("Choose an execution project before starting a mission.");
          }

          return await withMissionStartPending(setIsStartingMission, async () => {
            const requestBody: Record<string, unknown> = {
              parts,
              title: text.slice(0, 80),
              objective: text,
              executionProjectId: selectedExecutionProjectId,
              executionTargetMode: selectedExecutionTargetMode,
              contextProjectIds: selectedContextProjectIds,
            };

            if (isLunafreyaSurface) {
              requestBody.lunafreyaModel = agentModels.lunafreya ?? null;
              requestBody.selectedJobId = selectedLunafreyaJobId;
              requestBody.selectedSkillIds = selectedLunafreyaSkillIds;
            } else {
              requestBody.selectedOperation = selectedOperation;
              requestBody.noctisModel = agentModels.noctis ?? null;
              requestBody.allowedWorkers = allowedWorkers;
              requestBody.workerModels = {
                ignis: agentModels.ignis ?? null,
                gladiolus: agentModels.gladiolus ?? null,
                prompto: agentModels.prompto ?? null,
              };
            }

            const res = await fetch(missionStartEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(requestBody),
            });

            if (!res.ok) {
              const errorResult = (await res.json().catch(() => null)) as { error?: string } | null;
              throw new Error(errorResult?.error ?? `mission/start failed: ${res.status}`);
            }

            const data = (await res.json()) as {
              missionId: string;
              noctisSessionId?: string | null;
              lunafreyaSessionId?: string | null;
              operationState?: OperationState | null;
            };
            const sessionId = getMissionActionResponseSessionId(data, primaryAgentId);
            if (!sessionId) {
              throw new Error("Mission start returned no primary session.");
            }
            missionIdRef.current = data.missionId;
            noctisSessionIdRef.current = sessionId;
            setActiveOperationState(data.operationState ?? null);
            setWorkflowProgress(null);
            setActivityLog([]);
            setSelectedOperation(data.operationState?.operationRef ?? null);
            setNoctisSessionId(sessionId);
            setOptimisticSessionState(sessionId, "busy");
            setPendingMissionSession(data.missionId, sessionId);
            setPendingMissionMessages(data.missionId, [userMessage]);

            handleAgentEvent({ type: "session.created" });
            subscribeToSession(sessionId);
            setTranscriptState(createMissionTranscriptState(data.missionId, "pending", null, sessionId));
            return data.missionId;
          });
        } else {
          if (noctisSessionIdRef.current) {
            setOptimisticSessionState(noctisSessionIdRef.current, "busy");
          }
          handleAgentEvent({ type: "session.created" });
          if (noctisSessionIdRef.current) {
            subscribeToSession(noctisSessionIdRef.current);
          }
          const requestBody: Record<string, unknown> = {
            missionId: missionIdRef.current,
            parts,
          };

          if (isLunafreyaSurface) {
            requestBody.lunafreyaModel = agentModels.lunafreya ?? null;
            requestBody.selectedJobId = selectedLunafreyaJobId;
            requestBody.selectedSkillIds = selectedLunafreyaSkillIds;
          } else {
            requestBody.noctisModel = agentModels.noctis ?? null;
            requestBody.allowedWorkers = allowedWorkers;
          }

          const res = await fetch(missionContinueEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          });

          if (!res.ok) {
            const errorResult = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(errorResult?.error ?? `mission/continue failed: ${res.status}`);
          }

          const result = (await res.json().catch(() => null)) as {
            noctisSessionId?: string | null;
            lunafreyaSessionId?: string | null;
          } | null;
          const responseSessionId = result
            ? getMissionActionResponseSessionId(result, primaryAgentId)
            : null;
          if (responseSessionId && responseSessionId !== noctisSessionIdRef.current) {
            noctisSessionIdRef.current = responseSessionId;
            setNoctisSessionId(responseSessionId);
            subscribeToSession(responseSessionId);
          }

          const sessionId = responseSessionId ?? noctisSessionIdRef.current;
          if (sessionId) {
            setTranscriptState(
              createMissionTranscriptState(
                activeMissionIdRef.current ?? missionIdRef.current,
                "pending",
                null,
                sessionId,
              ),
            );
            requestSessionHistorySync(sessionId, {
              expectedLatestAssistantMessageId,
              trackStreamingMessage: true,
              reason: "mission-continue-response",
            });
          }
        }
        return missionIdRef.current;
      } catch (err) {
        const errorText = `Something went wrong. ${err instanceof Error ? err.message : String(err)}`;
        const errorMessage: ChatMessage = {
          id: createId(),
          sender: primaryAgentId,
          actor: primaryAgentId,
          speaker: primaryAgentId,
          kind: "assistant_message",
          content: errorText,
          errorInfo: {
            name: "MissionClientError",
            message: errorText,
          },
          rawText: errorText,
          parts: [
            {
              type: "text",
              text: errorText,
            },
          ],
          timestamp: new Date(),
          source: "session",
        };
        updateSessionMessages((prev) => [...prev, errorMessage]);
        clearStreamingState();
        setIsStreaming(false);
        clearProgressBanter();
        return null;
      }
    },
    [
      activeMissionId,
      clearProgressBanter,
      handleAgentEvent,
      isLunafreyaSurface,
      missionContinueEndpoint,
      missionStartEndpoint,
      primaryAgentId,
      sessionMessages,
      visibleTranscriptState,
      selectedOperation,
      selectedLunafreyaJobId,
      selectedLunafreyaSkillIds,
      setPendingMissionMessages,
      setPendingMissionSession,
      setOptimisticSessionState,
      subscribeToSession,
      requestSessionHistorySync,
      clearStreamingState,
      selectedContextProjectIds,
      selectedExecutionProjectId,
      selectedExecutionTargetMode,
      updateSessionMessages,
    ]
  );

  const abort = useCallback(async () => {
    const sessionId = noctisSessionIdRef.current;
    if (!sessionId) {
      return;
    }

    try {
      const response = await fetch(`/api/session/${sessionId}/abort`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`abort failed: ${response.status}`);
      }

      const nextMessages = await loadSessionMessages(
        sessionId,
        primaryAgentId,
        transcriptMode,
      ).catch(() => null);

      if (nextMessages && nextMessages.length > 0) {
        const retainedMessages = replaceSessionMessages(nextMessages);
        setTranscriptState(
          createMissionTranscriptState(
            activeMissionIdRef.current,
            resolveMissionTranscriptPhase(retainedMessages),
          )
        );
      } else {
        replaceSessionMessages([]);
        setTranscriptState(createMissionTranscriptState(activeMissionIdRef.current, "empty"));
      }

      clearStreamingState();
      setIsStreaming(false);
      beginAbortSettlement();
      clearProgressBanter();
      setPartyRuntime(createInitialPartyRuntimeState());
    } catch (err) {
      const errorText = `Unable to stop the current response. ${err instanceof Error ? err.message : String(err)}`;
      const errorMessage: ChatMessage = {
        id: createId(),
        sender: primaryAgentId,
        actor: primaryAgentId,
        speaker: primaryAgentId,
        kind: "assistant_message",
        content: errorText,
        errorInfo: {
          name: "MissionClientError",
          message: errorText,
        },
        rawText: errorText,
        parts: [
          {
            type: "text",
            text: errorText,
          },
        ],
        timestamp: new Date(),
        source: "session",
      };
      updateSessionMessages((prev) => [...prev, errorMessage]);
    }
  }, [
    beginAbortSettlement,
    clearProgressBanter,
    clearStreamingState,
    primaryAgentId,
    replaceSessionMessages,
    updateSessionMessages,
  ]);

  return {
    sessionId: noctisSessionId,
    messages,
    retainedHistory,
    liveDraft,
    streamingMessageId: liveDraft?.messageId ?? streamingMessageIdRef.current,
    streamingContent,
    banterEntries,
    latestBanterEntryId,
    speakingAgentId,
    partyMembers,
    historyErrorMessage: visibleTranscriptState.errorMessage,
    historyPhase: visibleTranscriptState.phase,
    abortSettlementPhase,
    isStartingMission,
    isSessionActive,
    isStreaming,
    isLoadingHistory,
    availableOperations,
    selectedOperation,
    activeOperationState,
    workflowProgress,
    activityLog,
    primaryContextUsage: contextUsageByAgent[primaryAgentId] ?? null,
    isOperationSelectionLocked: activeMissionId !== null,
    setSelectedOperation,
    send,
    abort,
  };
}
