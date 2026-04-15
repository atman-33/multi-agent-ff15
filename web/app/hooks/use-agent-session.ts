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
import { mergeStreamingText, parseSessionTextPartEvent } from "@/lib/session-stream";
import { parseRoutedMessageEnvelope } from "@/lib/team-message-format";
import type { OperationOption } from "@/lib/operation-presentation";
import type {
  AgentContextUsage,
  BanterTimelineEntry,
  DelegationLedger,
  LunafreyaFacetSelection,
  MissionActivityLogEntry,
  MissionPrimaryAgentId,
  MissionSurfaceId,
  MissionWorkflowProgress,
  MissionExecutionTargetMode,
  OperationState,
} from "@/lib/types/mission";
import type { BanterEntry } from "@/routes/_layout.noctis-team/components/banter-log";
import type { ChatMessage } from "@/routes/_layout.noctis-team/components/chat-area";
import { extractText } from "@/routes/_layout.noctis-team/components/message-parts";
import type { PartyMember } from "@/routes/_layout.noctis-team/components/party-status-panel";
import type { MessageInfo, MessagePart } from "@/routes/_layout.opencode.session.$id/types";
import { useChatStore } from "@/stores/chat-store";

type StreamAgentEvent = Extract<AgentEvent, { type: "message.part.updated" }> & {
  messageId?: string;
};

const PROGRESS_BANTER_DELAYS = {
  early: 4500,
  late: 10500,
} as const;

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

export type MissionResumePayload = {
  missionId: string;
  surfaceId?: MissionSurfaceId | null;
  primaryAgentId?: MissionPrimaryAgentId | null;
  primarySessionId?: string | null;
  title: string;
  objective?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  status: "active" | "completed" | "archived";
  executionProjectId?: string | null;
  executionTargetMode?: MissionExecutionTargetMode | null;
  contextProjectIds?: string[];
  baseBranch?: string | null;
  branch?: string | null;
  workspacePath?: string | null;
  workspaceStatus?: "ready" | "missing" | "deleted" | null;
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
  activityLog?: MissionActivityLogEntry[];
};

type MissionRuntimeSnapshot = MissionResumePayload & {
  contextUsageByAgent: Record<
    "noctis" | "lunafreya" | "ignis" | "gladiolus" | "prompto",
    AgentContextUsage | null
  >;
  banterTimeline: BanterTimelineEntry[];
  delegationLedger: DelegationLedger;
  sessionStatuses: Record<string, SessionStatus>;
  primaryMessages?: MessageInfo[];
  noctisMessages: MessageInfo[];
};

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

function extractLooseText(parts: MessagePart[]): string {
  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function coerceMessageTimestamp(rawValue: unknown, fallback: Date): Date {
  if (typeof rawValue === "string") {
    const parsed = new Date(rawValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return fallback;
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

function toSessionChatMessages(
  messages: MessageInfo[],
  primaryAgentId: MissionPrimaryAgentId,
): ChatMessage[] {
  return messages.reduce<ChatMessage[]>((accumulator, message, index) => {
    const messageRecord = message as unknown as Record<string, unknown>;
    const info = (messageRecord.info as Record<string, unknown> | undefined) ?? {};
    const parts = Array.isArray(messageRecord.parts) ? (messageRecord.parts as MessagePart[]) : [];
    const rawRole = info.role;

    const content = extractText(parts);
    const looseText = extractLooseText(parts);
    const fallbackContent = content || looseText;

    if (!fallbackContent && (rawRole !== "assistant" || parts.length === 0)) {
      return accumulator;
    }

    const rawId = info.id;
    const id =
      typeof rawId === "string" && rawId.length > 0 ? rawId : `restored-${index}-${createId()}`;
    const routedMessage =
      rawRole === "assistant" ? null : parseRoutedMessageEnvelope(fallbackContent);
    const sender =
      rawRole === "assistant" ? primaryAgentId : (routedMessage?.speaker ?? "user");
    const displayContent = routedMessage
      ? routedMessage.messageType === "report"
        ? routedMessage.body?.trim() || routedMessage.summary?.trim() || routedMessage.details?.trim() || ""
        : routedMessage.body?.trim() || ""
      : fallbackContent;
    const detailContent = routedMessage
      ? routedMessage.messageType === "report"
        ? [routedMessage.body?.trim(), routedMessage.summary?.trim(), routedMessage.details?.trim()]
            .filter(Boolean)
            .join("\n\n")
        : routedMessage.body?.trim() || fallbackContent
      : fallbackContent;

    accumulator.push({
      id,
      sender,
      actor: sender,
      speaker: sender,
      kind:
        rawRole === "assistant"
          ? "assistant_message"
          : sender === "user"
            ? "user_message"
            : "team_message",
      content: displayContent,
      detailContent,
      rawText: fallbackContent,
      parts,
      timestamp: coerceMessageTimestamp(
        info.createdAt ?? messageRecord.createdAt,
        new Date(Date.now() + index)
      ),
      source: "session",
    });

    return accumulator;
  }, []);
}

async function loadSessionMessages(
  sessionId: string,
  primaryAgentId: MissionPrimaryAgentId,
): Promise<ChatMessage[]> {
  const response = await fetch(`/api/session/${sessionId}`);
  if (!response.ok) {
    throw new Error(`session messages failed: ${response.status}`);
  }

  const data = (await response.json()) as { messages?: MessageInfo[] };
  const rawMessages = data.messages ?? [];
  const convertedMessages = toSessionChatMessages(rawMessages, primaryAgentId);

  return convertedMessages;
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
  messages: ChatMessage[];
  banterEntries: BanterEntry[];
  latestBanterEntryId: string | null;
  speakingAgentId: string | null;
  partyMembers: PartyMember[];
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
  const initialNoctisSessionId =
    activeMissionId && initialMissionData?.missionId === activeMissionId
      ? (initialMissionData.sessions.primary ?? initialMissionData.sessions.noctis)
      : pendingMissionSessionId;
  const initialWorkerSessionIds =
    activeMissionId && initialMissionData?.missionId === activeMissionId
      ? toWorkerSessionIds(initialMissionData.sessions)
      : createInitialWorkerSessionIds();
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>(initialMessages);
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
  const [_delegationLedger, setDelegationLedger] = useState<DelegationLedger | null>(null);
  const [contextUsageByAgent, setContextUsageByAgent] = useState(createInitialContextUsageByAgent);
  const [noctisSessionId, setNoctisSessionId] = useState<string | null>(initialNoctisSessionId);
  const [workerSessionIds, setWorkerSessionIds] =
    useState<WorkerSessionIds>(initialWorkerSessionIds);
  const [isStartingMission, setIsStartingMission] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const missionIdRef = useRef<string | null>(null);
  const activeMissionIdRef = useRef<string | null>(activeMissionId);
  const noctisSessionIdRef = useRef<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const lastIncomingNoctisMessageIdRef = useRef<string | null>(null);
  const hasHydratedRuntimeRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const workerEventSourcesRef = useRef<Partial<Record<WorkerMemberId, EventSource>>>({});
  const idleTimerRef = useRef<number | null>(null);
  const banterTimelineMissionIdRef = useRef<string | null>(null);
  const banterFeedPresenterRef = useRef<BanterFeedPresenter | null>(null);
  const hasHydratedNoctisSettledRef = useRef(false);
  const lastNoctisSettledRef = useRef(false);
  const lastSessionStateRef = useRef<SessionStatus | null>(null);
  const lastWorkerSessionStatesRef = useRef<Record<WorkerMemberId, SessionStatus | null>>(
    createInitialWorkerSessionStates()
  );
  const messages = sessionMessages;
  const sessionStatusRef = useRef<SessionStatus | null>(null);
  const pendingActiveResolversRef = useRef<Map<string, Array<() => void>>>(new Map());
  const progressTimersRef = useRef<
    Partial<Record<string, Partial<Record<"early" | "late", ReturnType<typeof setTimeout>>>>>
  >({});

  const sessionStates = useChatStore((state) => state.sessionStates);
  const setServerSessionState = useChatStore((state) => state.setServerSessionState);
  const replaceServerSessionStates = useChatStore((state) => state.replaceServerSessionStates);
  const setOptimisticSessionState = useChatStore((state) => state.setOptimisticSessionState);
  const setPendingMissionSession = useChatStore((state) => state.setPendingMissionSession);
  const clearPendingMissionSession = useChatStore((state) => state.clearPendingMissionSession);

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
  const isSessionActive = isSessionStatusActive(sessionStatus);
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

  const resolvePendingActive = useCallback((sessionId: string, status: SessionStatus) => {
    if (!isSessionStatusActive(status)) {
      return;
    }

    const resolvers = pendingActiveResolversRef.current.get(sessionId);
    if (!resolvers || resolvers.length === 0) {
      return;
    }

    pendingActiveResolversRef.current.delete(sessionId);
    for (const resolve of resolvers) {
      resolve();
    }
  }, []);

  const waitForActiveStatus = useCallback(async (sessionId: string, timeoutMs = 1200) => {
    const currentStatus = useChatStore.getState().sessionStates[sessionId] ?? null;
    if (isSessionStatusActive(currentStatus)) {
      return;
    }

    await new Promise<void>((resolve) => {
      const finish = () => {
        window.clearTimeout(timeout);
        const resolvers = pendingActiveResolversRef.current.get(sessionId) ?? [];
        const nextResolvers = resolvers.filter((entry) => entry !== finish);
        if (nextResolvers.length === 0) {
          pendingActiveResolversRef.current.delete(sessionId);
        } else {
          pendingActiveResolversRef.current.set(sessionId, nextResolvers);
        }
        resolve();
      };

      const timeout = window.setTimeout(finish, timeoutMs);
      const resolvers = pendingActiveResolversRef.current.get(sessionId) ?? [];
      pendingActiveResolversRef.current.set(sessionId, [...resolvers, finish]);
    });
  }, []);

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
      if (isLunafreyaSurface) {
        return;
      }

      const missionId = missionIdRef.current ?? activeMissionIdRef.current;
      if (!missionId) {
        return;
      }

      const response = await fetch(`/api/noctis/missions/${missionId}/banter`, {
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
    [isLunafreyaSurface]
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
    activeMissionIdRef.current = activeMissionId;

    if (previousMissionId === activeMissionId) {
      return;
    }

    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    closeWorkerEventSources();

    noctisSessionIdRef.current = initialNoctisSessionId ?? null;
    setNoctisSessionId(initialNoctisSessionId ?? null);
    setWorkerSessionIds(initialWorkerSessionIds);
    setDelegationLedger(null);
    streamingMessageIdRef.current = null;
    lastIncomingNoctisMessageIdRef.current = null;
    hasHydratedRuntimeRef.current = false;
    hasHydratedNoctisSettledRef.current = false;
    lastNoctisSettledRef.current = false;
    setIsStreaming(false);
    lastSessionStateRef.current = null;
    lastWorkerSessionStatesRef.current = createInitialWorkerSessionStates();
    sessionStatusRef.current = initialNoctisSessionId
      ? (useChatStore.getState().sessionStates[initialNoctisSessionId] ?? null)
      : null;
    setPartyRuntime(createInitialPartyRuntimeState());
  }, [activeMissionId, closeWorkerEventSources, initialNoctisSessionId, initialWorkerSessionIds]);

  const scheduleIdleReset = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(() => {
      setPartyRuntime(createInitialPartyRuntimeState());
    }, 2500);
  }, []);

  const syncSessionMessages = useCallback(
    async (sessionId: string, options?: { trackStreamingMessage?: boolean }) => {
      const nextMessages = await loadSessionMessages(sessionId, primaryAgentId);
      setSessionMessages(nextMessages.length > 0 ? nextMessages : initialMessages);

      if (!options?.trackStreamingMessage) {
        return;
      }

      const latestAssistant = [...nextMessages]
        .reverse()
        .find((message) => message.sender === primaryAgentId);
      streamingMessageIdRef.current = latestAssistant?.id ?? null;
    },
    [initialMessages, primaryAgentId]
  );

  const handleAgentEvent = useCallback(
    (event: AgentEvent | StreamAgentEvent) => {
      if (event.type === "message.part.updated") {
        const { text } = event;
        const eventMessageId = "messageId" in event ? event.messageId : undefined;
        if (!text) return;

        setIsStreaming(true);
        if (noctisSessionIdRef.current) {
          setOptimisticSessionState(noctisSessionIdRef.current, "busy", 4000);
        }
        setSessionMessages((prev) => {
          const streamId = eventMessageId ?? streamingMessageIdRef.current;
          if (streamId) {
            streamingMessageIdRef.current = streamId;
            return prev.map((m) => {
              if (m.id !== streamId) {
                return m;
              }

              const nextContent = mergeStreamingText(m.content, text);
              return {
                ...m,
                content: nextContent,
                parts: [{ type: "text", text: nextContent }],
              };
            });
          }
          const newId = createId();
          const resolvedId = eventMessageId ?? newId;
          streamingMessageIdRef.current = resolvedId;
          return [
            ...prev,
            {
              id: resolvedId,
              sender: primaryAgentId,
              actor: primaryAgentId,
              speaker: primaryAgentId,
              kind: "assistant_message" as const,
              content: text,
              rawText: text,
              parts: [{ type: "text", text }],
              timestamp: new Date(),
              source: "session" as const,
            },
          ];
        });
        return;
      }

      if (event.type === "session.completed") {
        setIsStreaming(false);
        streamingMessageIdRef.current = null;
        clearProgressBanter();
        scheduleIdleReset();
      }

        const update = isLunafreyaSurface ? null : eventToPartyUpdate(event);
      if (update) {
        setPartyRuntime((prev) => applyPartyRuntimeUpdate(prev, update));
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
      isLunafreyaSurface,
      persistAmbientBanter,
      primaryAgentId,
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

      const es = new EventSource(`/api/session/${sessionId}/events`);
      eventSourceRef.current = es;

      es.onmessage = (e: MessageEvent) => {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(e.data) as Record<string, unknown>;
        } catch {
          return;
        }

        const textPartEvent = parseSessionTextPartEvent(parsed);
        if (textPartEvent) {
          handleAgentEvent({
            type: "message.part.updated",
            text: textPartEvent.text,
            messageId: textPartEvent.messageId ?? undefined,
          });
          return;
        }

        const type = parsed.type;
        if (typeof type !== "string") return;

        if (type === "session.idle") {
          const sessionId = noctisSessionIdRef.current;
          if (sessionId) {
            setServerSessionState(sessionId, "idle");
            lastSessionStateRef.current = "idle";
            sessionStatusRef.current = "idle";
            void syncSessionMessages(sessionId).catch(() => undefined);
          }
          streamingMessageIdRef.current = null;
          handleAgentEvent({ type: "session.completed", message: "" });
          return;
        }

        if (type === "session.status") {
          const props = parsed.properties as Record<string, unknown> | undefined;
          const status = props?.status as Record<string, unknown> | undefined;
          const nextStatus = coerceSessionStatus(status?.type);
          if (nextStatus && noctisSessionIdRef.current) {
            setServerSessionState(noctisSessionIdRef.current, nextStatus);
            sessionStatusRef.current = nextStatus;
            resolvePendingActive(noctisSessionIdRef.current, nextStatus);
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
        setIsStreaming(false);
        clearProgressBanter();
      };
    },
    [
      clearProgressBanter,
      handleAgentEvent,
        primaryAgentId,
      resolvePendingActive,
      setServerSessionState,
      syncSessionMessages,
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
    (runtime: MissionRuntimeSnapshot, options?: { preserveStreaming?: boolean }) => {
      missionIdRef.current = runtime.missionId;
      setActiveOperationState(runtime.operationState ?? null);
      setWorkflowProgress(runtime.workflowProgress ?? null);
      setActivityLog(runtime.activityLog ?? []);
      setSelectedOperation(runtime.operationState?.operationRef ?? null);

      const nextPrimarySessionId = getMissionPrimarySessionIdFromPayload(runtime);
      const optimisticPrimaryStatus = nextPrimarySessionId
        ? (useChatStore.getState().optimisticSessionStates[nextPrimarySessionId] ?? null)
        : null;
      const shouldPreservePrimaryActive =
        isSessionStatusActive(optimisticPrimaryStatus) ||
        pendingMissionSessionId === nextPrimarySessionId ||
        isStreaming;
      const hasActiveDelegation = runtime.delegationLedger.activeTasks.some(
        (task) => task.status === "pending" || task.status === "running"
      );
      const isPrimarySettled = !shouldPreservePrimaryActive && !hasActiveDelegation;

      clearPendingMissionSession(runtime.missionId);

      if (noctisSessionIdRef.current !== nextPrimarySessionId) {
        noctisSessionIdRef.current = nextPrimarySessionId;
        setNoctisSessionId(nextPrimarySessionId);
        streamingMessageIdRef.current = null;
        if (nextPrimarySessionId) {
          subscribeToSession(nextPrimarySessionId);
        } else {
          eventSourceRef.current?.close();
          eventSourceRef.current = null;
        }
      } else {
        setNoctisSessionId((current) => current ?? nextPrimarySessionId);
      }

      setWorkerSessionIds((current) => {
        const nextWorkerSessionIds = toWorkerSessionIds(runtime.sessions);
        return areWorkerSessionIdsEqual(current, nextWorkerSessionIds)
          ? current
          : nextWorkerSessionIds;
      });
      setDelegationLedger(runtime.delegationLedger);
      syncPersistedBanterTimeline(runtime.banterTimeline ?? []);
      if (!hasHydratedNoctisSettledRef.current) {
        hasHydratedNoctisSettledRef.current = true;
        lastNoctisSettledRef.current = isPrimarySettled;
      } else if (!isLunafreyaSurface && isPrimarySettled && !lastNoctisSettledRef.current) {
        void persistAmbientBanter({
          speakerAgent: primaryAgentId,
          cue: "session-settled",
          sourceEvent: "session.settled",
        });
        lastNoctisSettledRef.current = true;
      } else {
        lastNoctisSettledRef.current = isPrimarySettled;
      }
      setContextUsageByAgent({
        noctis: runtime.contextUsageByAgent?.noctis ?? null,
        lunafreya: runtime.contextUsageByAgent?.lunafreya ?? null,
        ignis: runtime.contextUsageByAgent?.ignis ?? null,
        gladiolus: runtime.contextUsageByAgent?.gladiolus ?? null,
        prompto: runtime.contextUsageByAgent?.prompto ?? null,
      });

      const nextPrimaryStatus = nextPrimarySessionId
        ? runtime.sessionStatuses[nextPrimarySessionId]
        : null;

      if (nextPrimarySessionId && nextPrimaryStatus) {
        setServerSessionState(nextPrimarySessionId, nextPrimaryStatus);
        sessionStatusRef.current = nextPrimaryStatus;
      } else if (shouldPreservePrimaryActive) {
      } else if (nextPrimarySessionId) {
        setServerSessionState(nextPrimarySessionId, "idle");
        sessionStatusRef.current = "idle";
      } else {
        sessionStatusRef.current = null;
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

      const nextMessages = toSessionChatMessages(
        runtime.primaryMessages ?? runtime.noctisMessages,
        primaryAgentId,
      );
      const latestIncomingMessage = [...nextMessages]
        .reverse()
        .find((message) => message.sender !== primaryAgentId);

      if (!hasHydratedRuntimeRef.current) {
        lastIncomingNoctisMessageIdRef.current = latestIncomingMessage?.id ?? null;
        hasHydratedRuntimeRef.current = true;
      } else if (
        latestIncomingMessage?.id &&
        latestIncomingMessage.id !== lastIncomingNoctisMessageIdRef.current &&
        nextPrimarySessionId
      ) {
        lastIncomingNoctisMessageIdRef.current = latestIncomingMessage.id;
        setOptimisticSessionState(nextPrimarySessionId, "busy", 4000);
      }

      if (nextMessages.length > 0) {
        setSessionMessages((current) =>
          options?.preserveStreaming
            ? mergeRuntimeSessionMessages(current, nextMessages, primaryAgentId)
            : nextMessages
        );
      } else if (!options?.preserveStreaming) {
        setSessionMessages(initialMessages);
      }
    },
    [
      clearPendingMissionSession,
      initialMessages,
      isLunafreyaSurface,
      isStreaming,
      pendingMissionSessionId,
      persistAmbientBanter,
      primaryAgentId,
      setOptimisticSessionState,
      setServerSessionState,
      subscribeToSession,
      syncPersistedBanterTimeline,
    ]
  );

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      closeWorkerEventSources();
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
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

    let cancelled = false;

    const refreshMissionRuntime = async () => {
      try {
        const runtime = await loadMissionRuntimeSnapshot(activeMissionId, missionRouteBase);
        if (cancelled || runtime.missionId !== activeMissionId) {
          return;
        }

        applyMissionRuntimeSnapshot(runtime, { preserveStreaming: true });
      } catch {
        // Ignore transient mission runtime failures.
      }
    };

    void refreshMissionRuntime();
    const intervalId = window.setInterval(refreshMissionRuntime, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeMissionId, applyMissionRuntimeSnapshot, missionRouteBase]);

  useEffect(() => {
    const loadMission = async () => {
      if (!activeMissionId) {
        missionIdRef.current = null;
        noctisSessionIdRef.current = null;
        lastIncomingNoctisMessageIdRef.current = null;
        hasHydratedRuntimeRef.current = false;
        hasHydratedNoctisSettledRef.current = false;
        lastNoctisSettledRef.current = false;
        banterTimelineMissionIdRef.current = null;
        setNoctisSessionId(null);
        setActiveOperationState(null);
        setWorkflowProgress(null);
        setActivityLog([]);
        setSelectedOperation(null);
        setWorkerSessionIds(createInitialWorkerSessionIds());
        setDelegationLedger(null);
        setContextUsageByAgent(createInitialContextUsageByAgent());
        streamingMessageIdRef.current = null;
        setSessionMessages(initialMessages);
        clearBanterEntries();
        setPartyRuntime(createInitialPartyRuntimeState());
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

      setIsLoadingHistory(true);
      try {
        if (banterTimelineMissionIdRef.current !== activeMissionId) {
          clearBanterEntries();
          banterTimelineMissionIdRef.current = activeMissionId;
        }

        const hasPreloadedMessages =
          initialMissionData?.missionId === activeMissionId &&
          Array.isArray(initialMessageInfos) &&
          initialMessageInfos.length > 0;

        if (initialMissionData?.missionId === activeMissionId) {
          const initialPrimarySessionId = getMissionPrimarySessionIdFromPayload(initialMissionData);
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
          streamingMessageIdRef.current = null;
          if (hasPreloadedMessages) {
            const preloadedMessages = toSessionChatMessages(
              initialMessageInfos ?? [],
              primaryAgentId,
            );
            setSessionMessages(preloadedMessages.length > 0 ? preloadedMessages : initialMessages);
          }
          if (initialPrimarySessionId) {
            subscribeToSession(initialPrimarySessionId);
          }
        }

        setPartyRuntime(createInitialPartyRuntimeState());
        setIsStreaming(false);
        lastSessionStateRef.current = null;
        lastWorkerSessionStatesRef.current = createInitialWorkerSessionStates();
        sessionStatusRef.current = null;
        clearProgressBanter();

          const runtime = await loadMissionRuntimeSnapshot(activeMissionId, missionRouteBase);
        applyMissionRuntimeSnapshot(runtime, { preserveStreaming: false });
      } catch {
        missionIdRef.current = null;
        noctisSessionIdRef.current = null;
        lastIncomingNoctisMessageIdRef.current = null;
        hasHydratedRuntimeRef.current = false;
        hasHydratedNoctisSettledRef.current = false;
        lastNoctisSettledRef.current = false;
        setNoctisSessionId(null);
        setActiveOperationState(null);
        setWorkflowProgress(null);
        setActivityLog([]);
        setSelectedOperation(null);
        setWorkerSessionIds(createInitialWorkerSessionIds());
        setDelegationLedger(null);
        setContextUsageByAgent(createInitialContextUsageByAgent());
        setSessionMessages(initialMessages);
        sessionStatusRef.current = null;
        clearProgressBanter();
        replaceServerSessionStates({});
        closeWorkerEventSources();
      } finally {
        setIsLoadingHistory(false);
      }
    };

    void loadMission();
  }, [
    activeMissionId,
    clearBanterEntries,
    clearPendingMissionSession,
    clearProgressBanter,
    closeWorkerEventSources,
    initialMessages,
    initialMessageInfos,
    initialMissionData,
    applyMissionRuntimeSnapshot,
    missionRouteBase,
    primaryAgentId,
    replaceServerSessionStates,
    subscribeToSession,
  ]);

  const send = useCallback(
    async (parts: PromptPart[]) => {
      const text = stringifyPromptParts(parts);
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
      setSessionMessages((prev) => [...prev, userMessage]);
      streamingMessageIdRef.current = null;

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

            handleAgentEvent({ type: "session.created" });
            subscribeToSession(sessionId);
            await waitForActiveStatus(sessionId);
            void syncSessionMessages(sessionId, { trackStreamingMessage: true }).catch(
              () => undefined
            );
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
            void syncSessionMessages(sessionId, {
              trackStreamingMessage: true,
            }).catch(() => undefined);
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
        setSessionMessages((prev) => [...prev, errorMessage]);
        setIsStreaming(false);
        clearProgressBanter();
        return null;
      }
    },
    [
      clearProgressBanter,
      handleAgentEvent,
      isLunafreyaSurface,
      missionContinueEndpoint,
      missionStartEndpoint,
      primaryAgentId,
      selectedOperation,
      selectedLunafreyaJobId,
      selectedLunafreyaSkillIds,
      setPendingMissionSession,
      setOptimisticSessionState,
      subscribeToSession,
      syncSessionMessages,
      waitForActiveStatus,
      selectedContextProjectIds,
      selectedExecutionProjectId,
      selectedExecutionTargetMode,
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

      const nextMessages = await loadSessionMessages(sessionId, primaryAgentId).catch(() => null);

      if (nextMessages && nextMessages.length > 0) {
        setSessionMessages(nextMessages);
      } else {
        setSessionMessages(initialMessages);
      }

      streamingMessageIdRef.current = null;
      setIsStreaming(false);
      clearProgressBanter();
      setServerSessionState(sessionId, "idle");
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
      setSessionMessages((prev) => [...prev, errorMessage]);
    }
  }, [clearProgressBanter, initialMessages, primaryAgentId, setServerSessionState]);

  return {
    messages,
    banterEntries,
    latestBanterEntryId,
    speakingAgentId,
    partyMembers,
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
