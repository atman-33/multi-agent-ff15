import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatLogMeta {
  pane: string;
  event: string;
}

export interface ChatLogRecord {
  id: string;
  ts: string;
  agent: string;
  source: string;
  kind: "answer" | "status" | "error";
  content: string;
  session_id: string;
  meta: ChatLogMeta;
}

interface ChatLogPage {
  records: ChatLogRecord[];
  next_cursor: number;
  total_lines: number;
}

export type AgentId = "noctis" | "lunafreya";

const POLL_INTERVAL_MS = 3_000;
const INITIAL_LIMIT = 100;
const BUFFER_DELAY_MS = 100; // task 3.4: debounce frequent updates

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useAgentChatLog
 *
 * Fetches and polls agent chat JSONL logs via Tauri IPC.
 * - Initial load: last `INITIAL_LIMIT` records.
 * - Polling: every 3 s, cursor-based diff only.
 * - 100 ms buffer to suppress excessive re-renders (task 3.4).
 * - Empty array when file not found (task 3.5).
 */
export function useAgentChatLog() {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const [allRecords, setAllRecords] = useState<ChatLogRecord[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cursor tracks next line to read (task 3.2)
  const cursorRef = useRef<number | null>(null);
  // Buffer: pending records to merge after BUFFER_DELAY_MS
  const pendingRef = useRef<ChatLogRecord[]>([]);
  const bufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Flush pending records into state (task 3.4) */
  const flushBuffer = useCallback(() => {
    if (pendingRef.current.length === 0) return;
    const toAdd = pendingRef.current;
    pendingRef.current = [];
    setAllRecords((prev) => {
      // Dedup by id, keep order
      const existingIds = new Set(prev.map((r) => r.id));
      const fresh = toAdd.filter((r) => !existingIds.has(r.id));
      return fresh.length > 0 ? [...prev, ...fresh] : prev;
    });
    setLastUpdated(new Date());
  }, []);

  const scheduleFlush = useCallback(() => {
    if (bufferTimerRef.current) return;
    bufferTimerRef.current = setTimeout(() => {
      bufferTimerRef.current = null;
      flushBuffer();
    }, BUFFER_DELAY_MS);
  }, [flushBuffer]);

  /** Fetch records from Tauri. isInitial=true means full initial load. */
  const fetchRecords = useCallback(
    async (isInitial: boolean) => {
      if (!isTauri) return;
      try {
        const page = await invoke<ChatLogPage>("read_agent_chat_logs", {
          limit: INITIAL_LIMIT,
          cursor: isInitial ? null : cursorRef.current ?? null,
        });

        // Update cursor
        cursorRef.current = page.next_cursor;

        if (page.records.length === 0) return;

        if (isInitial) {
          // Replace full state on initial load
          setAllRecords(page.records);
          setLastUpdated(new Date());
        } else {
          // Buffer new records and flush after BUFFER_DELAY_MS
          pendingRef.current = [...pendingRef.current, ...page.records];
          scheduleFlush();
        }
        setError(null);
      } catch (e) {
        // "not found" is not an error state — just empty (task 3.5)
        const msg = String(e);
        if (msg.includes("not found") || msg.includes("No such file")) {
          setAllRecords([]);
          return;
        }
        setError(msg);
      }
    },
    [isTauri, scheduleFlush]
  );

  // Initial load
  useEffect(() => {
    fetchRecords(true);
  }, [fetchRecords]);

  // Polling (task 3.2)
  useEffect(() => {
    if (!isTauri) return;
    const timer = setInterval(() => fetchRecords(false), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isTauri, fetchRecords]);

  // Cleanup buffer timer on unmount
  useEffect(() => {
    return () => {
      if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
    };
  }, []);

  /**
   * Returns records filtered by agent name (task 3.3).
   * Memoization is handled by the caller via useMemo if needed.
   */
  const getRecordsForAgent = useCallback(
    (agent: AgentId): ChatLogRecord[] =>
      allRecords.filter((r) => r.agent === agent),
    [allRecords]
  );

  return {
    allRecords,
    getRecordsForAgent,
    lastUpdated,
    error,
    isTauri,
    /** Force an immediate refresh (e.g., on manual refresh button). */
    refresh: () => fetchRecords(false),
  };
}
