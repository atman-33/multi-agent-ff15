import { useEffect, useRef, useState } from "react";

interface ActivityEvent {
  text?: string;
  type: "tool" | "text" | "idle";
}

const MAX_ACTIVITY_LINES = 5;

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
): string[] {
  const [activityLines, setActivityLines] = useState<string[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isProcessing) {
      // Agent went idle — clear lines and close any open connection
      setActivityLines([]);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      return;
    }

    // Open SSE stream
    const es = new EventSource(`/api/agent-stream/${agent}`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(e.data) as ActivityEvent;
        if (parsed.type === "idle") {
          setActivityLines([]);
        } else if (parsed.text) {
          setActivityLines((prev) => [
            ...prev.slice(-(MAX_ACTIVITY_LINES - 1)),
            parsed.text as string,
          ]);
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

  return activityLines;
}
