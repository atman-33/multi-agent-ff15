import { useEffect, useRef, useState } from "react";
import type { ChatLogRecord } from "@/lib/chat-timeline";

const MAX_ACTIVITY_EVENTS = 200;

/**
 * Subscribe to the real-time activity stream for a given OpenCode agent.
 *
 * While `isProcessing` is true, opens an SSE connection to
 * `/api/agent-stream/:agent` and keeps the latest MAX_ACTIVITY_LINES entries.
 *
 * Returns an empty array when idle or when no activity has been received yet.
 *
 * @param agent  Agent name: "noctis" | "lunafreya" | "ignis" | ...
 * @param isProcessing  Whether the agent is currently busy (drives connection lifecycle)
 */
export function useAgentActivity(
  agent: string,
  isProcessing: boolean
): ChatLogRecord[] {
  const [activityEvents, setActivityEvents] = useState<ChatLogRecord[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isProcessing) {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setActivityEvents([]);
      return;
    }

    setActivityEvents([]);

    // Open SSE stream
    const es = new EventSource(`/api/agent-stream/${agent}`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(e.data) as ChatLogRecord;
        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.id === "string"
        ) {
          setActivityEvents((prev) => {
            const next = [...prev, parsed];
            return next.length > MAX_ACTIVITY_EVENTS
              ? next.slice(-MAX_ACTIVITY_EVENTS)
              : next;
          });
        }
      } catch {
        // ignore JSON parse errors
      }
    };

    es.onerror = () => {
      // Connection dropped — close and let the next isProcessing cycle reconnect
      es.close();
      esRef.current = null;
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [agent, isProcessing]);

  return activityEvents;
}
