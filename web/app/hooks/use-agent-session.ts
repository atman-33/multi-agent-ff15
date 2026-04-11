import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppLanguage } from "@/lib/app-language.server";
import { createBanterTemplate, normalizeBanterAgentId } from "@/lib/banter/runtime";
import type { BanterCue, BanterTemplate, RecentBanterEntry } from "@/lib/banter/types";
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
  DelegationLedger,
  MissionMessageLogEntry,
  OperationState,
  ReportStatus,
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

const REPORT_BANTER_CUE: Record<ReportStatus, BanterCue> = {
  running: "report-running",
  blocked: "report-blocked",
  completed: "report-completed",
  failed: "report-failed",
};

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

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "msg-init-1",
    sender: "noctis",
    actor: "noctis",
    speaker: "noctis",
    kind: "assistant_message",
    content: "We're on the road. What do you need?",
    timestamp: new Date(Date.now() - 300000),
    source: "session",
  },
];

export interface MissionSummary {
  missionId: string;
  title: string;
  objective?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  status: "active" | "completed" | "archived";
}

export type MissionResumePayload = {
  missionId: string;
  title: string;
  objective?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  status: "active" | "completed" | "archived";
  executionProjectId?: string | null;
  contextProjectIds?: string[];
  baseBranch?: string | null;
  branch?: string | null;
  workspacePath?: string | null;
  workspaceStatus?: "ready" | "missing" | "deleted" | null;
  resumeBlockedReason?: string | null;
  sessions: {
    noctis: string | null;
    ignis: string | null;
    gladiolus: string | null;
    prompto: string | null;
  };
  operationState?: OperationState | null;
};

type MissionRuntimeSnapshot = MissionResumePayload & {
  contextUsageByAgent: Record<
    "noctis" | "ignis" | "gladiolus" | "prompto",
    AgentContextUsage | null
  >;
  delegationLedger: DelegationLedger;
  messageLog: MissionMessageLogEntry[];
  sessionStatuses: Record<string, SessionStatus>;
  noctisMessages: MessageInfo[];
};

function buildMissionMessageBanterTemplates(
  entry: MissionMessageLogEntry,
  options: { language: AppLanguage; recentEntries: RecentBanterEntry[] }
): BanterTemplate[] {
  if (entry.deliveryStatus !== "sent") {
    return [];
  }

  if (entry.fromAgent === "noctis" && entry.toAgent !== "noctis") {
    return [
      createBanterTemplate("noctis", "task-delegated", options),
      createBanterTemplate(entry.toAgent, "message-received", options),
    ].filter((template): template is BanterTemplate => template !== null);
  }

  if (entry.type === "report" && entry.toAgent === "noctis" && entry.reportStatus) {
    return [
      createBanterTemplate(entry.fromAgent, REPORT_BANTER_CUE[entry.reportStatus], options),
      ...(entry.reportStatus === "completed"
        ? [createBanterTemplate("noctis", "report-acknowledged", options)]
        : []),
    ].filter((template): template is BanterTemplate => template !== null);
  }

  return [];
}

function computeBanterRevealDelay(queueLength: number): number {
  if (queueLength >= 4) {
    return 420;
  }

  const baseDelay = 500 + Math.floor(Math.random() * 351);
  return Math.max(420, baseDelay - Math.min(queueLength, 3) * 45);
}

function createInitialContextUsageByAgent(): Record<
  "noctis" | "ignis" | "gladiolus" | "prompto",
  AgentContextUsage | null
> {
  return {
    noctis: null,
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

async function loadMissionRuntimeSnapshot(missionId: string): Promise<MissionRuntimeSnapshot> {
  const response = await fetch(`/api/noctis/missions/${missionId}/runtime`);
  if (!response.ok) {
    throw new Error(`mission runtime failed: ${response.status}`);
  }

  return (await response.json()) as MissionRuntimeSnapshot;
}

function mergeRuntimeSessionMessages(current: ChatMessage[], next: ChatMessage[]): ChatMessage[] {
  if (current.length === 0) {
    return next;
  }

  const currentById = new Map(current.map((message) => [message.id, message]));
  const merged = next.map((message) => {
    const existing = currentById.get(message.id);
    if (!existing || existing.sender !== "noctis" || message.sender !== "noctis") {
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
    (message) => message.sender === "noctis" && !mergedIds.has(message.id)
  );

  return optimisticTail.length > 0 ? [...merged, ...optimisticTail] : merged;
}

function toSessionChatMessages(messages: MessageInfo[]): ChatMessage[] {
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
    const sender = rawRole === "assistant" ? "noctis" : (routedMessage?.speaker ?? "user");
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

async function loadSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const response = await fetch(`/api/session/${sessionId}`);
  if (!response.ok) {
    throw new Error(`session messages failed: ${response.status}`);
  }

  const data = (await response.json()) as { messages?: MessageInfo[] };
  const rawMessages = data.messages ?? [];
  const convertedMessages = toSessionChatMessages(rawMessages);

  return convertedMessages;
}

export interface UseAgentSessionOptions {
  activeMissionId: string | null;
  language?: AppLanguage;
  initialMissionData?: MissionResumePayload | null;
  initialMessageInfos?: MessageInfo[] | null;
  selectedExecutionProjectId?: string | null;
  selectedContextProjectIds?: string[];
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
  language = "other",
  initialMissionData,
  initialMessageInfos,
  selectedExecutionProjectId,
  selectedContextProjectIds = [],
}: UseAgentSessionOptions): UseAgentSessionReturn {
  const pendingMissionSessionId = useChatStore((state) =>
    activeMissionId ? (state.pendingMissionSessions[activeMissionId] ?? null) : null
  );
  const initialNoctisSessionId =
    activeMissionId && initialMissionData?.missionId === activeMissionId
      ? initialMissionData.sessions.noctis
      : pendingMissionSessionId;
  const initialWorkerSessionIds =
    activeMissionId && initialMissionData?.missionId === activeMissionId
      ? toWorkerSessionIds(initialMissionData.sessions)
      : createInitialWorkerSessionIds();
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [availableOperations, setAvailableOperations] = useState<OperationOption[]>([]);
  const [selectedOperation, setSelectedOperation] = useState<string | null>(null);
  const [activeOperationState, setActiveOperationState] = useState<OperationState | null>(null);
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
  const hasHydratedMissionMessageLogRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const workerEventSourcesRef = useRef<Partial<Record<WorkerMemberId, EventSource>>>({});
  const idleTimerRef = useRef<number | null>(null);
  const banterRevealTimerRef = useRef<number | null>(null);
  const speakingResetTimerRef = useRef<number | null>(null);
  const banterEntriesRef = useRef<RecentBanterEntry[]>([]);
  const banterMissionIdRef = useRef<string | null>(null);
  const pendingBanterTemplatesRef = useRef<BanterTemplate[]>([]);
  const seenMissionMessageIdsRef = useRef<Set<string>>(new Set());
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

  useEffect(() => {
    let cancelled = false;

    const loadAvailableOperations = async () => {
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
  }, [selectedExecutionProjectId]);

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

  const addBanter = useCallback((template: BanterTemplate) => {
    pendingBanterTemplatesRef.current.push(template);

    if (banterRevealTimerRef.current) {
      return;
    }

    const revealNext = (delay: number) => {
      banterRevealTimerRef.current = window.setTimeout(() => {
        banterRevealTimerRef.current = null;
        const nextTemplate = pendingBanterTemplatesRef.current.shift();
        if (!nextTemplate) {
          return;
        }

        const nextEntry = { ...nextTemplate, id: createId(), timestamp: new Date() };
        setBanterEntries((prev) => {
          const nextEntries = [...prev, nextEntry];
          banterEntriesRef.current = nextEntries.map((entry) => ({
            speakerId: entry.speakerId,
            message: entry.message,
          }));
          return nextEntries;
        });
        setLatestBanterEntryId(nextEntry.id);
        setSpeakingAgentId(nextEntry.speakerId);

        if (speakingResetTimerRef.current) {
          clearTimeout(speakingResetTimerRef.current);
        }
        speakingResetTimerRef.current = window.setTimeout(() => {
          setSpeakingAgentId((current) => (current === nextEntry.speakerId ? null : current));
          speakingResetTimerRef.current = null;
        }, SPEAKING_INDICATOR_MS);

        if (pendingBanterTemplatesRef.current.length > 0) {
          revealNext(computeBanterRevealDelay(pendingBanterTemplatesRef.current.length));
        }
      }, delay);
    };

    revealNext(INITIAL_BANTER_REVEAL_DELAY_MS);
  }, []);

  const clearBanterEntries = useCallback(() => {
    if (banterRevealTimerRef.current) {
      clearTimeout(banterRevealTimerRef.current);
      banterRevealTimerRef.current = null;
    }
    if (speakingResetTimerRef.current) {
      clearTimeout(speakingResetTimerRef.current);
      speakingResetTimerRef.current = null;
    }
    pendingBanterTemplatesRef.current = [];
    banterEntriesRef.current = [];
    setLatestBanterEntryId(null);
    setSpeakingAgentId(null);
    setBanterEntries([]);
  }, []);

  const syncMissionMessageBanter = useCallback(
    (messageLog: MissionMessageLogEntry[]) => {
      const seenIds = seenMissionMessageIdsRef.current;

      if (!hasHydratedMissionMessageLogRef.current) {
        for (const entry of messageLog) {
          seenIds.add(entry.id);
        }
        hasHydratedMissionMessageLogRef.current = true;
        return;
      }

      let recentEntries = banterEntriesRef.current;
      const orderedEntries = messageLog
        .filter((entry) => !seenIds.has(entry.id))
        .sort(
          (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        );

      for (const entry of orderedEntries) {
        seenIds.add(entry.id);
        const templates = buildMissionMessageBanterTemplates(entry, {
          language,
          recentEntries,
        });

        for (const template of templates) {
          addBanter(template);
          recentEntries = [
            ...recentEntries,
            { speakerId: template.speakerId, message: template.message },
          ];
        }
      }
    },
    [addBanter, language]
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
    hasHydratedMissionMessageLogRef.current = false;
    hasHydratedNoctisSettledRef.current = false;
    lastNoctisSettledRef.current = false;
    seenMissionMessageIdsRef.current = new Set();
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
      const nextMessages = await loadSessionMessages(sessionId);
      setSessionMessages(nextMessages.length > 0 ? nextMessages : INITIAL_MESSAGES);

      if (!options?.trackStreamingMessage) {
        return;
      }

      const latestAssistant = [...nextMessages]
        .reverse()
        .find((message) => message.sender === "noctis");
      streamingMessageIdRef.current = latestAssistant?.id ?? null;
    },
    []
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
              sender: "noctis" as const,
              actor: "noctis" as const,
              speaker: "noctis" as const,
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

      const update = eventToPartyUpdate(event, {
        language,
        recentEntries: banterEntriesRef.current,
      });
      if (update) {
        setPartyRuntime((prev) => applyPartyRuntimeUpdate(prev, update));
        if (update.banterTemplate) {
          addBanter(update.banterTemplate);
        }
      }
    },
    [addBanter, clearProgressBanter, language, scheduleIdleReset, setOptimisticSessionState]
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
              clearProgressBanter("noctis");
              handleAgentEvent({ type: "task.retrying", agentId: "noctis" });
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
      setSelectedOperation(runtime.operationState?.operationRef ?? null);

      const nextNoctisSessionId = runtime.sessions.noctis;
      const optimisticNoctisStatus = nextNoctisSessionId
        ? (useChatStore.getState().optimisticSessionStates[nextNoctisSessionId] ?? null)
        : null;
      const shouldPreserveNoctisActive =
        isSessionStatusActive(optimisticNoctisStatus) ||
        pendingMissionSessionId === nextNoctisSessionId ||
        isStreaming;
      const hasActiveDelegation = runtime.delegationLedger.activeTasks.some(
        (task) => task.status === "pending" || task.status === "running"
      );
      const isNoctisSettled = !shouldPreserveNoctisActive && !hasActiveDelegation;

      clearPendingMissionSession(runtime.missionId);

      if (noctisSessionIdRef.current !== nextNoctisSessionId) {
        noctisSessionIdRef.current = nextNoctisSessionId;
        setNoctisSessionId(nextNoctisSessionId);
        streamingMessageIdRef.current = null;
        if (nextNoctisSessionId) {
          subscribeToSession(nextNoctisSessionId);
        } else {
          eventSourceRef.current?.close();
          eventSourceRef.current = null;
        }
      } else {
        setNoctisSessionId((current) => current ?? nextNoctisSessionId);
      }

      setWorkerSessionIds((current) => {
        const nextWorkerSessionIds = toWorkerSessionIds(runtime.sessions);
        return areWorkerSessionIdsEqual(current, nextWorkerSessionIds)
          ? current
          : nextWorkerSessionIds;
      });
      setDelegationLedger(runtime.delegationLedger);
      syncMissionMessageBanter(runtime.messageLog ?? []);
      if (!hasHydratedNoctisSettledRef.current) {
        hasHydratedNoctisSettledRef.current = true;
        lastNoctisSettledRef.current = isNoctisSettled;
      } else if (isNoctisSettled && !lastNoctisSettledRef.current) {
        const settledTemplate = createBanterTemplate("noctis", "session-settled", {
          language,
          recentEntries: banterEntriesRef.current,
        });
        if (settledTemplate) {
          addBanter(settledTemplate);
        }
        lastNoctisSettledRef.current = true;
      } else {
        lastNoctisSettledRef.current = isNoctisSettled;
      }
      setContextUsageByAgent({
        noctis: runtime.contextUsageByAgent?.noctis ?? null,
        ignis: runtime.contextUsageByAgent?.ignis ?? null,
        gladiolus: runtime.contextUsageByAgent?.gladiolus ?? null,
        prompto: runtime.contextUsageByAgent?.prompto ?? null,
      });

      const nextNoctisStatus = nextNoctisSessionId
        ? runtime.sessionStatuses[nextNoctisSessionId]
        : null;

      if (nextNoctisSessionId && nextNoctisStatus) {
        setServerSessionState(nextNoctisSessionId, nextNoctisStatus);
        sessionStatusRef.current = nextNoctisStatus;
      } else if (shouldPreserveNoctisActive) {
      } else if (nextNoctisSessionId) {
        setServerSessionState(nextNoctisSessionId, "idle");
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

      const nextMessages = toSessionChatMessages(runtime.noctisMessages);
      const latestIncomingMessage = [...nextMessages]
        .reverse()
        .find((message) => message.sender !== "noctis");

      if (!hasHydratedRuntimeRef.current) {
        lastIncomingNoctisMessageIdRef.current = latestIncomingMessage?.id ?? null;
        hasHydratedRuntimeRef.current = true;
      } else if (
        latestIncomingMessage?.id &&
        latestIncomingMessage.id !== lastIncomingNoctisMessageIdRef.current &&
        nextNoctisSessionId
      ) {
        lastIncomingNoctisMessageIdRef.current = latestIncomingMessage.id;
        setOptimisticSessionState(nextNoctisSessionId, "busy", 4000);
      }

      if (nextMessages.length > 0) {
        setSessionMessages((current) =>
          options?.preserveStreaming
            ? mergeRuntimeSessionMessages(current, nextMessages)
            : nextMessages
        );
      } else if (!options?.preserveStreaming) {
        setSessionMessages(INITIAL_MESSAGES);
      }
    },
    [
      clearPendingMissionSession,
      isStreaming,
      pendingMissionSessionId,
      language,
      addBanter,
      setOptimisticSessionState,
      setServerSessionState,
      subscribeToSession,
      syncMissionMessageBanter,
    ]
  );

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      closeWorkerEventSources();
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      if (banterRevealTimerRef.current) {
        clearTimeout(banterRevealTimerRef.current);
      }
      if (speakingResetTimerRef.current) {
        clearTimeout(speakingResetTimerRef.current);
      }
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
        const runtime = await loadMissionRuntimeSnapshot(activeMissionId);
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
  }, [activeMissionId, applyMissionRuntimeSnapshot]);

  useEffect(() => {
    const loadMission = async () => {
      if (!activeMissionId) {
        missionIdRef.current = null;
        noctisSessionIdRef.current = null;
        lastIncomingNoctisMessageIdRef.current = null;
        hasHydratedRuntimeRef.current = false;
        hasHydratedMissionMessageLogRef.current = false;
        hasHydratedNoctisSettledRef.current = false;
        lastNoctisSettledRef.current = false;
        banterMissionIdRef.current = null;
        seenMissionMessageIdsRef.current = new Set();
        setNoctisSessionId(null);
        setActiveOperationState(null);
        setSelectedOperation(null);
        setWorkerSessionIds(createInitialWorkerSessionIds());
        setDelegationLedger(null);
        setContextUsageByAgent(createInitialContextUsageByAgent());
        streamingMessageIdRef.current = null;
        setSessionMessages(INITIAL_MESSAGES);
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
        if (banterMissionIdRef.current !== activeMissionId) {
          clearBanterEntries();
          banterMissionIdRef.current = activeMissionId;
        }

        const hasPreloadedMessages =
          initialMissionData?.missionId === activeMissionId &&
          Array.isArray(initialMessageInfos) &&
          initialMessageInfos.length > 0;

        if (initialMissionData?.missionId === activeMissionId) {
          missionIdRef.current = initialMissionData.missionId;
          clearPendingMissionSession(initialMissionData.missionId);
          noctisSessionIdRef.current = initialMissionData.sessions.noctis;
          setNoctisSessionId(initialMissionData.sessions.noctis);
          setActiveOperationState(initialMissionData.operationState ?? null);
          setSelectedOperation(initialMissionData.operationState?.operationRef ?? null);
          setWorkerSessionIds(toWorkerSessionIds(initialMissionData.sessions));
          setContextUsageByAgent(createInitialContextUsageByAgent());
          streamingMessageIdRef.current = null;
          if (hasPreloadedMessages) {
            const preloadedMessages = toSessionChatMessages(initialMessageInfos ?? []);
            setSessionMessages(preloadedMessages.length > 0 ? preloadedMessages : INITIAL_MESSAGES);
          }
          if (initialMissionData.sessions.noctis) {
            subscribeToSession(initialMissionData.sessions.noctis);
          }
        }

        setPartyRuntime(createInitialPartyRuntimeState());
        setIsStreaming(false);
        lastSessionStateRef.current = null;
        lastWorkerSessionStatesRef.current = createInitialWorkerSessionStates();
        sessionStatusRef.current = null;
        clearProgressBanter();

        const runtime = await loadMissionRuntimeSnapshot(activeMissionId);
        applyMissionRuntimeSnapshot(runtime, { preserveStreaming: false });
      } catch {
        missionIdRef.current = null;
        noctisSessionIdRef.current = null;
        lastIncomingNoctisMessageIdRef.current = null;
        hasHydratedRuntimeRef.current = false;
        hasHydratedMissionMessageLogRef.current = false;
        hasHydratedNoctisSettledRef.current = false;
        lastNoctisSettledRef.current = false;
        seenMissionMessageIdsRef.current = new Set();
        setNoctisSessionId(null);
        setActiveOperationState(null);
        setSelectedOperation(null);
        setWorkerSessionIds(createInitialWorkerSessionIds());
        setDelegationLedger(null);
        setContextUsageByAgent(createInitialContextUsageByAgent());
        setSessionMessages(INITIAL_MESSAGES);
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
    initialMessageInfos,
    initialMissionData,
    applyMissionRuntimeSnapshot,
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
            const res = await fetch("/api/noctis/mission/start", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                parts,
                title: text.slice(0, 80),
                objective: text,
                executionProjectId: selectedExecutionProjectId,
                contextProjectIds: selectedContextProjectIds,
                selectedOperation,
                noctisModel: agentModels.noctis ?? null,
                allowedWorkers,
                workerModels: {
                  ignis: agentModels.ignis ?? null,
                  gladiolus: agentModels.gladiolus ?? null,
                  prompto: agentModels.prompto ?? null,
                },
              }),
            });

            if (!res.ok) {
              throw new Error(`mission/start failed: ${res.status}`);
            }

            const data = (await res.json()) as {
              missionId: string;
              noctisSessionId: string;
              operationState?: OperationState | null;
            };
            missionIdRef.current = data.missionId;
            noctisSessionIdRef.current = data.noctisSessionId;
            setActiveOperationState(data.operationState ?? null);
            setSelectedOperation(data.operationState?.operationRef ?? null);
            setNoctisSessionId(data.noctisSessionId);
            setOptimisticSessionState(data.noctisSessionId, "busy");
            setPendingMissionSession(data.missionId, data.noctisSessionId);

            handleAgentEvent({ type: "session.created" });
            subscribeToSession(data.noctisSessionId);
            await waitForActiveStatus(data.noctisSessionId);
            void syncSessionMessages(data.noctisSessionId, { trackStreamingMessage: true }).catch(
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
          const res = await fetch("/api/noctis/mission/continue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              missionId: missionIdRef.current,
              parts,
              noctisModel: agentModels.noctis ?? null,
              allowedWorkers,
            }),
          });

          if (!res.ok) {
            throw new Error(`mission/continue failed: ${res.status}`);
          }

          if (noctisSessionIdRef.current) {
            void syncSessionMessages(noctisSessionIdRef.current, {
              trackStreamingMessage: true,
            }).catch(() => undefined);
          }
        }
        return missionIdRef.current;
      } catch (err) {
        const errorMessage: ChatMessage = {
          id: createId(),
          sender: "noctis",
          actor: "noctis",
          speaker: "noctis",
          kind: "assistant_message",
          content: `Something went wrong. ${err instanceof Error ? err.message : String(err)}`,
          rawText: `Something went wrong. ${err instanceof Error ? err.message : String(err)}`,
          parts: [
            {
              type: "text",
              text: `Something went wrong. ${err instanceof Error ? err.message : String(err)}`,
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
      selectedOperation,
      setPendingMissionSession,
      setOptimisticSessionState,
      subscribeToSession,
      syncSessionMessages,
      waitForActiveStatus,
      selectedContextProjectIds,
      selectedExecutionProjectId,
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

      const nextMessages = await loadSessionMessages(sessionId).catch(() => null);

      if (nextMessages && nextMessages.length > 0) {
        setSessionMessages(nextMessages);
      }

      streamingMessageIdRef.current = null;
      setIsStreaming(false);
      clearProgressBanter();
      setServerSessionState(sessionId, "idle");
      setPartyRuntime(createInitialPartyRuntimeState());
    } catch (err) {
      const errorMessage: ChatMessage = {
        id: createId(),
        sender: "noctis",
        actor: "noctis",
        speaker: "noctis",
        kind: "assistant_message",
        content: `Unable to stop the current response. ${err instanceof Error ? err.message : String(err)}`,
        rawText: `Unable to stop the current response. ${err instanceof Error ? err.message : String(err)}`,
        parts: [
          {
            type: "text",
            text: `Unable to stop the current response. ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        timestamp: new Date(),
        source: "session",
      };
      setSessionMessages((prev) => [...prev, errorMessage]);
    }
  }, [clearProgressBanter, setServerSessionState]);

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
    isOperationSelectionLocked: activeMissionId !== null,
    setSelectedOperation,
    send,
    abort,
  };
}
