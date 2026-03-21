import { useCallback, useEffect, useRef, useState } from "react";
import type { BanterEntry } from "@/routes/_layout.noctis-team/components/banter-log";
import type { ChatMessage } from "@/routes/_layout.noctis-team/components/chat-area";
import { extractReasoning, extractText, extractTools } from "@/routes/_layout.noctis-team/components/message-parts";
import type { PartyMember } from "@/routes/_layout.noctis-team/components/party-status-panel";
import type { MessageInfo, MessagePart } from "@/routes/_layout.opencode.session.$id/types";
import type { AppLanguage } from "@/lib/app-language.server";
import { normalizeBanterAgentId } from "@/lib/banter/runtime";
import type { RecentBanterEntry } from "@/lib/banter/types";
import {
  applyPartyUpdate,
  eventToPartyUpdate,
  resetToIdle,
  type AgentEvent,
} from "@/lib/event-to-party-update";
import { stringifyPromptParts, type PromptPart } from "@/lib/prompt-parts";
import { useChatStore } from "@/stores/chat-store";

type SessionState = "idle" | "busy" | "retry";

const PROGRESS_BANTER_DELAYS = {
  early: 4500,
  late: 10500,
} as const;

const INITIAL_PARTY: PartyMember[] = [
  {
    id: "noctis",
    name: "Noctis",
    role: "Commander",
    imageSrc: "/images/noctis.png",
    status: "idle",
    task: "On the road",
  },
  {
    id: "ignis",
    name: "Ignis",
    role: "Analyst",
    imageSrc: "/images/ignis.png",
    status: "idle",
    task: "Awaiting orders",
  },
  {
    id: "gladio",
    name: "Gladio",
    role: "Executor",
    imageSrc: "/images/gladiolus.png",
    status: "idle",
    task: "Standing by",
  },
  {
    id: "prompto",
    name: "Prompto",
    role: "Reporter",
    imageSrc: "/images/prompto.png",
    status: "idle",
    task: "Monitoring feeds",
  },
];

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
  isAwaitingReply: boolean;
  send: (parts: PromptPart[]) => Promise<string | null>;
  abort: () => Promise<void>;
}

export function useAgentSession({
  activeMissionId,
  language = "other",
  initialMissionData,
  initialMessageInfos,
}: UseAgentSessionOptions): UseAgentSessionReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [banterEntries, setBanterEntries] = useState<BanterEntry[]>([]);
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>(INITIAL_PARTY);
  const [noctisSessionId, setNoctisSessionId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);

  const missionIdRef = useRef<string | null>(null);
  const noctisSessionIdRef = useRef<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const banterEntriesRef = useRef<RecentBanterEntry[]>([]);
  const awaitingReplyRef = useRef(false);
  const lastSessionStateRef = useRef<SessionState | null>(null);
  const progressTimersRef = useRef<
    Partial<Record<string, Partial<Record<"early" | "late", ReturnType<typeof setTimeout>>>>>
  >({});

  const sessionStates = useChatStore((state) => state.sessionStates);
  const setSessionState = useChatStore((state) => state.setSessionState);
  const isSessionActive = noctisSessionId ? (sessionStates[noctisSessionId] ?? "idle") !== "idle" : false;

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
    awaitingReplyRef.current = isAwaitingReply;
  }, [isAwaitingReply]);

  const scheduleIdleReset = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      setPartyMembers((prev) => resetToIdle(prev));
    }, 2500);
  }, []);

  useEffect(() => {
    setPartyMembers((prev) =>
      prev.map((member) => {
        if (member.id !== "noctis") {
          return member;
        }

        if (isSessionActive) {
          if (member.status === "working" && member.task === "Coordinating…") {
            return member;
          }

          return {
            ...member,
            status: "working",
            task: "Coordinating…",
          };
        }

        if (member.status === "working") {
          return {
            ...member,
            status: "idle",
            task: "On the road",
            detail: undefined,
          };
        }

        return member;
      })
    );
  }, [isSessionActive]);

  const handleAgentEvent = useCallback(
    (event: AgentEvent) => {
      if (event.type === "message.part.updated") {
        const { text } = event;
        if (!text) return;

        setIsStreaming(true);
        setIsAwaitingReply(true);
        awaitingReplyRef.current = true;
        if (noctisSessionIdRef.current) {
          setSessionState(noctisSessionIdRef.current, "busy");
        }
        setMessages((prev) => {
          const streamId = streamingMessageIdRef.current;
          if (streamId) {
            return prev.map((m) => {
              if (m.id !== streamId) {
                return m;
              }

              const nextContent = m.content + text;
              return {
                ...m,
                content: nextContent,
                parts: [{ type: "text", text: nextContent }],
              };
            });
          }
          const newId = createId();
          streamingMessageIdRef.current = newId;
          return [
            ...prev,
            {
              id: newId,
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
        setIsAwaitingReply(false);
        awaitingReplyRef.current = false;
        streamingMessageIdRef.current = null;
        clearProgressBanter();
        scheduleIdleReset();
      }

      const update = eventToPartyUpdate(event, {
        language,
        recentEntries: banterEntriesRef.current,
      });
      if (update) {
        setPartyMembers((prev) => applyPartyUpdate(prev, update));
        if (update.banterTemplate) {
          addBanter(update.banterTemplate);
        }
      }
    },
    [addBanter, clearProgressBanter, language, scheduleIdleReset, setSessionState]
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
          if (!awaitingReplyRef.current) {
            return;
          }
          handleAgentEvent({ type: "task.progress", agentId: normalized, stage: "early" });
        }, PROGRESS_BANTER_DELAYS.early),
        late: setTimeout(() => {
          if (!awaitingReplyRef.current) {
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

        const type = parsed.type;
        if (typeof type !== "string") return;

        if (type === "message.part.updated") {
          const props = parsed.properties as Record<string, unknown> | undefined;
          const part = props?.part as Record<string, unknown> | undefined;
          if (part?.type === "text" && typeof part.text === "string") {
            handleAgentEvent({ type: "message.part.updated", text: part.text });
          }
          return;
        }

        if (type === "session.idle") {
          const sessionId = noctisSessionIdRef.current;
          if (sessionId) {
            setSessionState(sessionId, "idle");
            lastSessionStateRef.current = "idle";
            void loadSessionMessages(sessionId)
              .then((nextMessages) => {
                setMessages(nextMessages.length > 0 ? nextMessages : INITIAL_MESSAGES);
              })
              .catch(() => undefined);
          }
          streamingMessageIdRef.current = null;
          handleAgentEvent({ type: "session.completed", message: "" });
          return;
        }

        if (type === "session.status") {
          const props = parsed.properties as Record<string, unknown> | undefined;
          const status = props?.status as Record<string, unknown> | undefined;
          const nextStatus = status?.type;
          if (typeof nextStatus === "string" && noctisSessionIdRef.current) {
            const mappedStatus: SessionState = nextStatus === "idle" ? "idle" : nextStatus === "retry" ? "retry" : "busy";
            setSessionState(noctisSessionIdRef.current, mappedStatus);
            if (mappedStatus === "retry" && lastSessionStateRef.current !== "retry") {
              clearProgressBanter("noctis");
              handleAgentEvent({ type: "task.retrying", agentId: "noctis" });
              scheduleProgressBanter("noctis");
            }
            lastSessionStateRef.current = mappedStatus;
          }
          if (nextStatus === "busy" || nextStatus === "retry") {
            setIsAwaitingReply(true);
            awaitingReplyRef.current = true;
          }
          return;
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        if (noctisSessionIdRef.current) {
          setSessionState(noctisSessionIdRef.current, "idle");
        }
        lastSessionStateRef.current = "idle";
        setIsStreaming(false);
        setIsAwaitingReply(false);
        awaitingReplyRef.current = false;
        clearProgressBanter();
      };
    },
    [clearProgressBanter, handleAgentEvent, scheduleProgressBanter, setSessionState]
  );

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      clearProgressBanter();
    };
  }, [clearProgressBanter]);

  useEffect(() => {
    if (!noctisSessionId || !isSessionActive) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    if (pollingIntervalRef.current) {
      return;
    }

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch("/api/session-status");
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { statuses?: Record<string, SessionState> };
        const nextStatus = data.statuses?.[noctisSessionId];
        if (nextStatus) {
          setSessionState(noctisSessionId, nextStatus);
        }
      } catch {
        return;
      }
    }, 3000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isSessionActive, noctisSessionId, setSessionState]);

  useEffect(() => {
    const loadMission = async () => {
      if (!activeMissionId) {
        missionIdRef.current = null;
        noctisSessionIdRef.current = null;
        setNoctisSessionId(null);
        streamingMessageIdRef.current = null;
        setMessages(INITIAL_MESSAGES);
        clearBanterEntries();
        setPartyMembers(INITIAL_PARTY);
        setIsStreaming(false);
        setIsAwaitingReply(false);
        awaitingReplyRef.current = false;
        lastSessionStateRef.current = null;
        clearProgressBanter();
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
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
        setPartyMembers(INITIAL_PARTY);
        setIsStreaming(false);
        setIsAwaitingReply(false);
        awaitingReplyRef.current = false;
        lastSessionStateRef.current = null;
        clearProgressBanter();
        subscribeToSession(mission.sessions.noctis);
      } catch {
        missionIdRef.current = null;
        noctisSessionIdRef.current = null;
        setNoctisSessionId(null);
        setMessages(INITIAL_MESSAGES);
        setIsAwaitingReply(false);
        awaitingReplyRef.current = false;
        clearProgressBanter();
      } finally {
        setIsLoadingHistory(false);
      }
    };

    void loadMission();
  }, [activeMissionId, clearBanterEntries, clearProgressBanter, initialMessageInfos, initialMissionData, subscribeToSession]);

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
      setIsAwaitingReply(true);
      awaitingReplyRef.current = true;

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
          setSessionState(data.noctisSessionId, "busy");
          lastSessionStateRef.current = "busy";

          handleAgentEvent({ type: "session.created" });
          scheduleProgressBanter("noctis");
          subscribeToSession(data.noctisSessionId);
          return data.missionId;
        } else {
          handleAgentEvent({ type: "session.created" });
          scheduleProgressBanter("noctis");
          if (noctisSessionIdRef.current) {
            setSessionState(noctisSessionIdRef.current, "busy");
            lastSessionStateRef.current = "busy";
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
        if (noctisSessionIdRef.current) {
          setSessionState(noctisSessionIdRef.current, "idle");
        }
        setIsStreaming(false);
        setIsAwaitingReply(false);
        awaitingReplyRef.current = false;
        lastSessionStateRef.current = "idle";
        clearProgressBanter();
        return null;
      }
    },
    [clearProgressBanter, handleAgentEvent, scheduleProgressBanter, setSessionState, subscribeToSession]
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

      setSessionState(sessionId, "idle");
      lastSessionStateRef.current = "idle";
      streamingMessageIdRef.current = null;
      setIsStreaming(false);
      setIsAwaitingReply(false);
      awaitingReplyRef.current = false;
      clearProgressBanter();
      setPartyMembers((prev) => resetToIdle(prev));
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
    isAwaitingReply,
    send,
    abort,
  };
}
