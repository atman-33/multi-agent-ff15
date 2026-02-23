import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatLogMeta {
  event: string;
  pane: string;
}

export interface ChatLogRecord {
  agent: string;
  content: string;
  id: string;
  kind: "answer" | "status" | "error";
  meta: ChatLogMeta;
  session_id: string;
  source: string;
  ts: string;
}

interface ChatLogPage {
  next_cursor: number;
  records: ChatLogRecord[];
  reset?: boolean;
  total_lines: number;
}

export type AgentId =
  | "noctis"
  | "lunafreya"
  | "ignis"
  | "gladiolus"
  | "prompto"
  | "iris";
/** Agents that have their own dedicated chat column. */
export type MainAgentId = "noctis" | "lunafreya";

const POLL_INTERVAL_MS = 3000;
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
  /**
   * Ref that is updated SYNCHRONOUSLY inside fetchRecords before the buffer
   * delay fires. Consumers can read this immediately after `await refresh()`
   * to get the truly up-to-date record list without waiting for React state.
   */
  const allRecordsRef = useRef<ChatLogRecord[]>([]);

  /** Flush pending records into state (task 3.4) */
  const flushBuffer = useCallback(() => {
    if (pendingRef.current.length === 0) {
      return;
    }
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
    if (bufferTimerRef.current) {
      return;
    }
    bufferTimerRef.current = setTimeout(() => {
      bufferTimerRef.current = null;
      flushBuffer();
    }, BUFFER_DELAY_MS);
  }, [flushBuffer]);

  /** Fetch records from Tauri IPC or web API. isInitial=true means full initial load. */
  const fetchRecords = useCallback(
    async (isInitial: boolean) => {
      try {
        let page: ChatLogPage;
        if (isTauri) {
          page = await invoke<ChatLogPage>("read_agent_chat_logs", {
            limit: INITIAL_LIMIT,
            cursor: isInitial ? null : (cursorRef.current ?? null),
          });
        } else {
          const params = new URLSearchParams({
            limit: String(INITIAL_LIMIT),
          });
          if (!isInitial && cursorRef.current != null) {
            params.set("cursor", String(cursorRef.current));
          }
          const res = await fetch(`/api/chat-logs?${params}`);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          page = await res.json();
          if ((page as unknown as { error?: string }).error) {
            throw new Error((page as unknown as { error: string }).error);
          }
        }

        // Update cursor
        cursorRef.current = page.next_cursor;
        setLastUpdated(new Date());

        const isReset = (page as any).reset === true;

        if (page.records.length === 0 && !isReset) {
          return;
        }

        if (isInitial || isReset) {
          // Replace full state on initial load or if file was truncated
          allRecordsRef.current = page.records;
          setAllRecords(page.records);
          pendingRef.current = [];
        } else {
          // Sync the ref immediately (before the 100 ms buffer delay)
          const existingIds = new Set(allRecordsRef.current.map((r) => r.id));
          const fresh = page.records.filter((r) => !existingIds.has(r.id));
          if (fresh.length > 0) {
            allRecordsRef.current = [...allRecordsRef.current, ...fresh];
          }
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

  // Polling
  useEffect(() => {
    const timer = setInterval(() => fetchRecords(false), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchRecords]);

  // Cleanup buffer timer on unmount
  useEffect(() => {
    return () => {
      if (bufferTimerRef.current) {
        clearTimeout(bufferTimerRef.current);
      }
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
    allRecordsRef,
    getRecordsForAgent,
    lastUpdated,
    error,
    isTauri,
    /** Force an immediate refresh (e.g., on manual refresh button). */
    refresh: () => fetchRecords(false),
  };
}
