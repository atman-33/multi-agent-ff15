import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BanterEntry } from "@/routes/_layout.noctis-team/components/banter-log";
import type { ChatMessage } from "@/routes/_layout.noctis-team/components/chat-area";
import { extractReasoning, extractText, extractTools } from "@/routes/_layout.noctis-team/components/message-parts";
import type { PartyMember } from "@/routes/_layout.noctis-team/components/party-status-panel";
import type { MessageInfo, MessagePart } from "@/routes/_layout.opencode.session.$id/types";
import type { AppLanguage } from "@/lib/app-language.server";
import { normalizeBanterAgentId } from "@/lib/banter/runtime";
import type { RecentBanterEntry } from "@/lib/banter/types";
import {
  eventToPartyUpdate,
  type AgentEvent,
} from "@/lib/event-to-party-update";
import { stringifyPromptParts, type PromptPart } from "@/lib/prompt-parts";
import {
  coerceSessionStatus,
  isSessionStatusActive,
  type SessionStatus,
} from "@/lib/session-status";
import { mergeStreamingText, parseSessionTextPartEvent } from "@/lib/session-stream";
import { useChatStore } from "@/stores/chat-store";

type StreamAgentEvent = Extract<AgentEvent, { type: "message.part.updated" }> & {
  messageId?: string;
};

const PROGRESS_BANTER_DELAYS = {
  early: 4500,
  late: 10500,
} as const;

const PARTY_MEMBER_META = [
  {
    id: "noctis",
    name: "Noctis",
    role: "Commander",
    imageSrc: "/images/noctis.png",
    defaultTask: "On the road",
  },
  {
    id: "ignis",
    name: "Ignis",
    role: "Analyst",
    imageSrc: "/images/ignis.png",
    defaultTask: "Awaiting orders",
  },
  {
    id: "gladio",
    name: "Gladio",
    role: "Executor",
    imageSrc: "/images/gladiolus.png",
    defaultTask: "Standing by",
  },
  {
    id: "prompto",
    name: "Prompto",
    role: "Reporter",
    imageSrc: "/images/prompto.png",
    defaultTask: "Monitoring feeds",
  },
] as const;

type PartyRuntimeEntry = Pick<PartyMember, "status" | "task" | "detail" | "progress">;
type PartyRuntimeState = Record<string, PartyRuntimeEntry>;

function createInitialPartyRuntimeState(): PartyRuntimeState {
  return Object.fromEntries(
    PARTY_MEMBER_META.map((member) => [
      member.id,
      {
        status: "idle",
        task: member.defaultTask,
        detail: undefined,
        progress: undefined,
      },
    ])
  ) as PartyRuntimeState;
}

function applyPartyRuntimeUpdate(
  current: PartyRuntimeState,
  update: { memberId: string; status: PartyMember["status"]; task: string; detail?: string }
): PartyRuntimeState {
  const existing = current[update.memberId];
  if (!existing) {
    return current;
  }

  return {
    ...current,
    [update.memberId]: {
      ...existing,
      status: update.status,
      task: update.task,
      detail: update.detail,
      progress: undefined,
    },
  };
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "msg-init-1",
    role: "noctis",
    content: "We're on the road. What do you need?",
    timestamp: new Date(Date.now() - 300000),
  },
];

export interface MissionSummary {
  missionId: string;
  title: string;
  objective?: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "completed" | "archived";
}

export type MissionResumePayload = {
  missionId: string;
  title: string;
  objective?: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "completed" | "archived";
  sessions: {
    noctis: string;
    ignis: string | null;
    gladiolus: string | null;
    prompto: string | null;
  };
};

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function extractLooseText(parts: MessagePart[]): string {
  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function toChatMessages(messages: MessageInfo[]): ChatMessage[] {
  return messages.reduce<ChatMessage[]>((accumulator, message, index) => {
    const messageRecord = message as unknown as Record<string, unknown>;
    const info = (messageRecord.info as Record<string, unknown> | undefined) ?? {};
    const parts = Array.isArray(messageRecord.parts) ? (messageRecord.parts as MessagePart[]) : [];

    const content = extractText(parts);
    const reasoning = extractReasoning(parts);
    const tools = extractTools(parts);
    const looseText = extractLooseText(parts);
    const fallbackContent = content || looseText;

    const rawId = info.id;
    const id = typeof rawId === "string" && rawId.length > 0 ? rawId : `restored-${index}-${createId()}`;
    const rawRole = info.role;
    const role = rawRole === "assistant" ? "noctis" : "user";

    accumulator.push({
      id,
      role,
      content: fallbackContent,
      parts,
      timestamp: new Date(),
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
  const convertedMessages = toChatMessages(rawMessages);

  return convertedMessages;
}

export interface UseAgentSessionOptions {
  activeMissionId: string | null;
  language?: AppLanguage;
  initialMissionData?: MissionResumePayload | null;
  initialMessageInfos?: MessageInfo[] | null;
}

export interface UseAgentSessionReturn {
  messages: ChatMessage[];
  banterEntries: BanterEntry[];
  partyMembers: PartyMember[];
  isSessionActive: boolean;
  isStreaming: boolean;
  isLoadingHistory: boolean;
  send: (parts: PromptPart[]) => Promise<string | null>;
  abort: () => Promise<void>;
}

export function useAgentSession({
  activeMissionId,
  language = "other",
  initialMissionData,
  initialMessageInfos,
}: UseAgentSessionOptions): UseAgentSessionReturn {
  const initialNoctisSessionId =
    activeMissionId && initialMissionData?.missionId === activeMissionId
      ? initialMissionData.sessions.noctis
      : null;
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [banterEntries, setBanterEntries] = useState<BanterEntry[]>([]);
  const [partyRuntime, setPartyRuntime] = useState<PartyRuntimeState>(createInitialPartyRuntimeState);
  const [noctisSessionId, setNoctisSessionId] = useState<string | null>(initialNoctisSessionId);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const missionIdRef = useRef<string | null>(null);
  const noctisSessionIdRef = useRef<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const banterEntriesRef = useRef<RecentBanterEntry[]>([]);
  const lastSessionStateRef = useRef<SessionStatus | null>(null);
  const sessionStatusRef = useRef<SessionStatus | null>(null);
  const pendingActiveResolversRef = useRef<Map<string, Array<() => void>>>(new Map());
  const progressTimersRef = useRef<
    Partial<Record<string, Partial<Record<"early" | "late", ReturnType<typeof setTimeout>>>>>
  >({});

  const sessionStates = useChatStore((state) => state.sessionStates);
  const setSessionState = useChatStore((state) => state.setSessionState);
  const sessionStatus = noctisSessionId ? (sessionStates[noctisSessionId] ?? null) : null;
  const isSessionActive = isSessionStatusActive(sessionStatus);
  const partyMembers = useMemo<PartyMember[]>(
    () =>
      PARTY_MEMBER_META.map((member) => {
        const runtime = partyRuntime[member.id] ?? {
          status: "idle",
          task: member.defaultTask,
        };

        if (member.id === "noctis" && isSessionActive) {
          return {
            id: member.id,
            name: member.name,
            role: member.role,
            imageSrc: member.imageSrc,
            status: "working",
            task: "Coordinating…",
            detail: runtime.detail,
            progress: runtime.progress,
          };
        }

        return {
          id: member.id,
          name: member.name,
          role: member.role,
          imageSrc: member.imageSrc,
          status: runtime.status,
          task: runtime.task,
          detail: runtime.detail,
          progress: runtime.progress,
        };
      }),
    [isSessionActive, partyRuntime]
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

  const addBanter = useCallback(
    (template: { speakerId: string; speakerName: string; speakerAvatar: string; message: string }) => {
      setBanterEntries((prev) => [
        ...prev,
        (() => {
          const nextEntry = { ...template, id: createId(), timestamp: new Date() };
          banterEntriesRef.current = [
            ...prev,
            { speakerId: nextEntry.speakerId, message: nextEntry.message },
          ];
          return nextEntry;
        })(),
      ]);
    },
    []
  );

  const clearBanterEntries = useCallback(() => {
    banterEntriesRef.current = [];
    setBanterEntries([]);
  }, []);

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

  const scheduleIdleReset = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      setPartyRuntime(createInitialPartyRuntimeState());
    }, 2500);
  }, []);

  const syncSessionMessages = useCallback(
    async (sessionId: string, options?: { trackStreamingMessage?: boolean }) => {
      const nextMessages = await loadSessionMessages(sessionId);
      setMessages(nextMessages.length > 0 ? nextMessages : INITIAL_MESSAGES);

      if (!options?.trackStreamingMessage) {
        return;
      }

      const latestAssistant = [...nextMessages].reverse().find((message) => message.role === "noctis");
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
        setMessages((prev) => {
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
              role: "noctis" as const,
              content: text,
              parts: [{ type: "text", text }],
              timestamp: new Date(),
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
    [addBanter, clearProgressBanter, language, scheduleIdleReset]
  );

  const scheduleProgressBanter = useCallback(
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
            setSessionState(sessionId, "idle");
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
            setSessionState(noctisSessionIdRef.current, nextStatus);
            sessionStatusRef.current = nextStatus;
            resolvePendingActive(noctisSessionIdRef.current, nextStatus);
            if (nextStatus === "retry" && lastSessionStateRef.current !== "retry") {
              clearProgressBanter("noctis");
              handleAgentEvent({ type: "task.retrying", agentId: "noctis" });
              scheduleProgressBanter("noctis");
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
      scheduleProgressBanter,
      setSessionState,
      syncSessionMessages,
    ]
  );

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      clearProgressBanter();
    };
  }, [clearProgressBanter]);

  useEffect(() => {
    const loadMission = async () => {
      if (!activeMissionId) {
        missionIdRef.current = null;
        noctisSessionIdRef.current = null;
        setNoctisSessionId(null);
        streamingMessageIdRef.current = null;
        setMessages(INITIAL_MESSAGES);
        clearBanterEntries();
        setPartyRuntime(createInitialPartyRuntimeState());
        setIsStreaming(false);
        lastSessionStateRef.current = null;
        sessionStatusRef.current = null;
        clearProgressBanter();
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
        return;
      }

      setIsLoadingHistory(true);
      try {
        const mission = initialMissionData?.missionId === activeMissionId
          ? initialMissionData
          : await (async () => {
              const missionRes = await fetch(`/api/noctis/missions/${activeMissionId}`);
              if (!missionRes.ok) {
                throw new Error(`mission fetch failed: ${missionRes.status}`);
              }
              return (await missionRes.json()) as MissionResumePayload;
            })();

        const hasPreloadedMessages =
          initialMissionData?.missionId === activeMissionId &&
          Array.isArray(initialMessageInfos) &&
          initialMessageInfos.length > 0;

        let chatMessages = hasPreloadedMessages
          ? toChatMessages(initialMessageInfos)
          : [];

        if (chatMessages.length === 0) {
          chatMessages = await loadSessionMessages(mission.sessions.noctis);
        }

        missionIdRef.current = mission.missionId;
        noctisSessionIdRef.current = mission.sessions.noctis;
        setNoctisSessionId(mission.sessions.noctis);
        streamingMessageIdRef.current = null;
        setMessages(chatMessages.length > 0 ? chatMessages : INITIAL_MESSAGES);
        clearBanterEntries();
        setPartyRuntime(createInitialPartyRuntimeState());
        setIsStreaming(false);
        lastSessionStateRef.current = null;
        sessionStatusRef.current = null;
        clearProgressBanter();
        subscribeToSession(mission.sessions.noctis);
      } catch {
        missionIdRef.current = null;
        noctisSessionIdRef.current = null;
        setNoctisSessionId(null);
        setMessages(INITIAL_MESSAGES);
        sessionStatusRef.current = null;
        clearProgressBanter();
      } finally {
        setIsLoadingHistory(false);
      }
    };

    void loadMission();
  }, [
    activeMissionId,
    clearBanterEntries,
    clearProgressBanter,
    initialMessageInfos,
    initialMissionData,
    subscribeToSession,
  ]);

  const send = useCallback(
    async (parts: PromptPart[]) => {
      const text = stringifyPromptParts(parts);
      const userMessage: ChatMessage = {
        id: createId(),
        role: "user",
        content: text,
        parts: [{ type: "text", text }],
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      streamingMessageIdRef.current = null;

      const agentModels = useChatStore.getState().agentModels;

      try {
        if (!missionIdRef.current) {
          const res = await fetch("/api/noctis/mission/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parts,
              title: text.slice(0, 80),
              objective: text,
              noctisModel: agentModels["noctis"] ?? null,
              workerModels: {
                ignis: agentModels["ignis"] ?? null,
                gladiolus: agentModels["gladiolus"] ?? null,
                prompto: agentModels["prompto"] ?? null,
              },
            }),
          });

          if (!res.ok) {
            throw new Error(`mission/start failed: ${res.status}`);
          }

          const data = (await res.json()) as { missionId: string; noctisSessionId: string };
          missionIdRef.current = data.missionId;
          noctisSessionIdRef.current = data.noctisSessionId;
          setNoctisSessionId(data.noctisSessionId);

          handleAgentEvent({ type: "session.created" });
          scheduleProgressBanter("noctis");
          subscribeToSession(data.noctisSessionId);
          await waitForActiveStatus(data.noctisSessionId);
          void syncSessionMessages(data.noctisSessionId, { trackStreamingMessage: true }).catch(
            () => undefined
          );
          return data.missionId;
        } else {
          handleAgentEvent({ type: "session.created" });
          scheduleProgressBanter("noctis");
          if (noctisSessionIdRef.current) {
            subscribeToSession(noctisSessionIdRef.current);
          }
          const res = await fetch("/api/noctis/mission/continue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              missionId: missionIdRef.current,
              parts,
              noctisModel: agentModels["noctis"] ?? null,
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
          role: "noctis",
          content: `Something went wrong. ${err instanceof Error ? err.message : String(err)}`,
          parts: [
            {
              type: "text",
              text: `Something went wrong. ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsStreaming(false);
        clearProgressBanter();
        return null;
      }
    },
    [
      clearProgressBanter,
      handleAgentEvent,
      scheduleProgressBanter,
      subscribeToSession,
      syncSessionMessages,
      waitForActiveStatus,
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
        setMessages(nextMessages);
      }

      streamingMessageIdRef.current = null;
      setIsStreaming(false);
      clearProgressBanter();
      setSessionState(sessionId, "idle");
      setPartyRuntime(createInitialPartyRuntimeState());
    } catch (err) {
      const errorMessage: ChatMessage = {
        id: createId(),
        role: "noctis",
        content: `Unable to stop the current response. ${err instanceof Error ? err.message : String(err)}`,
        parts: [
          {
            type: "text",
            text: `Unable to stop the current response. ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  }, [clearProgressBanter, setSessionState]);

  return {
    messages,
    banterEntries,
    partyMembers,
    isSessionActive,
    isStreaming,
    isLoadingHistory,
    send,
    abort,
  };
}
