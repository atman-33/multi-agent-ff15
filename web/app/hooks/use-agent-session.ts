import { useCallback, useEffect, useRef, useState } from "react";
import type { BanterEntry } from "@/routes/_layout.noctis-team/components/banter-log";
import type { ChatMessage } from "@/routes/_layout.noctis-team/components/chat-area";
import type { PartyMember } from "@/routes/_layout.noctis-team/components/party-status-panel";
import {
  applyPartyUpdate,
  eventToPartyUpdate,
  resetToIdle,
  type AgentEvent,
} from "@/lib/event-to-party-update";

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

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface UseAgentSessionReturn {
  messages: ChatMessage[];
  banterEntries: BanterEntry[];
  partyMembers: PartyMember[];
  isStreaming: boolean;
  send: (text: string) => Promise<void>;
}

export function useAgentSession(): UseAgentSessionReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [banterEntries, setBanterEntries] = useState<BanterEntry[]>([]);
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>(INITIAL_PARTY);
  const [isStreaming, setIsStreaming] = useState(false);

  const missionIdRef = useRef<string | null>(null);
  const noctisSessionIdRef = useRef<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addBanter = useCallback(
    (template: { speakerId: string; speakerName: string; speakerAvatar: string; message: string }) => {
      setBanterEntries((prev) => [
        ...prev,
        { ...template, id: createId(), timestamp: new Date() },
      ]);
    },
    []
  );

  const scheduleIdleReset = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      setPartyMembers((prev) => resetToIdle(prev));
    }, 2500);
  }, []);

  const handleAgentEvent = useCallback(
    (event: AgentEvent) => {
      if (event.type === "message.part.updated") {
        const { text } = event;
        if (!text) return;

        setIsStreaming(true);
        setMessages((prev) => {
          const streamId = streamingMessageIdRef.current;
          if (streamId) {
            return prev.map((m) =>
              m.id === streamId ? { ...m, content: m.content + text } : m
            );
          }
          const newId = createId();
          streamingMessageIdRef.current = newId;
          return [
            ...prev,
            { id: newId, role: "noctis" as const, content: text, timestamp: new Date() },
          ];
        });
        return;
      }

      if (event.type === "session.completed") {
        setIsStreaming(false);
        streamingMessageIdRef.current = null;
        scheduleIdleReset();
      }

      const update = eventToPartyUpdate(event);
      if (update) {
        setPartyMembers((prev) => applyPartyUpdate(prev, update));
        if (update.banterTemplate) {
          addBanter(update.banterTemplate);
        }
      }
    },
    [addBanter, scheduleIdleReset]
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
          handleAgentEvent({ type: "session.completed", message: "" });
          return;
        }

        if (type === "session.status") {
          const props = parsed.properties as Record<string, unknown> | undefined;
          const status = props?.status as Record<string, unknown> | undefined;
          if (status?.type === "busy") {
            handleAgentEvent({ type: "session.created" });
          }
          return;
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
      };
    },
    [handleAgentEvent]
  );

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  const send = useCallback(
    async (text: string) => {
      const userMessage: ChatMessage = {
        id: createId(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      streamingMessageIdRef.current = null;

      try {
        if (!missionIdRef.current) {
          const res = await fetch("/api/noctis/mission/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text }),
          });

          if (!res.ok) {
            throw new Error(`mission/start failed: ${res.status}`);
          }

          const data = (await res.json()) as { missionId: string; noctisSessionId: string };
          missionIdRef.current = data.missionId;
          noctisSessionIdRef.current = data.noctisSessionId;

          handleAgentEvent({ type: "session.created" });
          subscribeToSession(data.noctisSessionId);
        } else {
          const res = await fetch("/api/noctis/mission/continue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              missionId: missionIdRef.current,
              message: text,
            }),
          });

          if (!res.ok) {
            throw new Error(`mission/continue failed: ${res.status}`);
          }
        }
      } catch (err) {
        const errorMessage: ChatMessage = {
          id: createId(),
          role: "noctis",
          content: `Something went wrong. ${err instanceof Error ? err.message : String(err)}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsStreaming(false);
      }
    },
    [handleAgentEvent, subscribeToSession]
  );

  return { messages, banterEntries, partyMembers, isStreaming, send };
}
