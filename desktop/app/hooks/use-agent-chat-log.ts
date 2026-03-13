import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatLogMeta, ChatLogRecord } from "@/lib/chat-timeline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatLogPage {
  next_cursor: number;
  records: ChatLogRecord[];
  reset?: boolean;
  total_lines: number;
}

type AgentRecordMap = Partial<Record<AgentId, ChatLogRecord[]>>;
type AgentCursorMap = Partial<Record<AgentId, number | null>>;

export type AgentId =
  | "noctis"
  | "lunafreya"
  | "ignis"
  | "gladiolus"
  | "prompto"
  | "iris";
/** Agents that have their own dedicated chat column. */
export type MainAgentId = "noctis" | "lunafreya";

export type { ChatLogMeta, ChatLogRecord };

const POLL_INTERVAL_MS = 3000;
const INITIAL_LIMIT = 100;
const BUFFER_DELAY_MS = 100; // task 3.4: debounce frequent updates
const CHAT_LOG_AGENTS: AgentId[] = [
  "noctis",
  "lunafreya",
  "ignis",
  "gladiolus",
  "prompto",
  "iris",
];

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

  const [recordsByAgent, setRecordsByAgent] = useState<AgentRecordMap>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cursor tracks next record to read per agent.
  const cursorRef = useRef<AgentCursorMap>({});
  // Buffer: pending records to merge after BUFFER_DELAY_MS.
  const pendingRef = useRef<AgentRecordMap>({});
  const bufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Ref that is updated SYNCHRONOUSLY inside fetchRecords before the buffer
   * delay fires. Consumers can read this immediately after `await refresh()`
   * to get the truly up-to-date record list without waiting for React state.
   */
  const allRecordsRef = useRef<AgentRecordMap>({});

  const flattenRecordMap = useCallback((recordMap: AgentRecordMap) => {
    return Object.values(recordMap)
      .flat()
      .sort(
        (left, right) =>
          new Date(left.ts).getTime() - new Date(right.ts).getTime()
      );
  }, []);

  /** Flush pending records into state (task 3.4) */
  const flushBuffer = useCallback(() => {
    const pendingEntries = Object.entries(pendingRef.current) as Array<
      [AgentId, ChatLogRecord[] | undefined]
    >;
    if (pendingEntries.every(([, records]) => !records || records.length === 0)) {
      return;
    }
    const toAdd = pendingRef.current;
    pendingRef.current = {};
    setRecordsByAgent((prev) => {
      let changed = false;
      const next: AgentRecordMap = { ...prev };

      for (const [agent, records] of Object.entries(toAdd) as Array<
        [AgentId, ChatLogRecord[] | undefined]
      >) {
        if (!records || records.length === 0) {
          continue;
        }

        const existing = next[agent] ?? [];
        const existingIds = new Set(existing.map((record) => record.id));
        const fresh = records.filter((record) => !existingIds.has(record.id));
        if (fresh.length === 0) {
          continue;
        }

        next[agent] = [...existing, ...fresh];
        changed = true;
      }

      return changed ? next : prev;
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

  const fetchRecordsForAgent = useCallback(
    async (agent: AgentId, isInitial: boolean) => {
      let page: ChatLogPage;
      if (isTauri) {
        page = await invoke<ChatLogPage>("read_agent_chat_logs", {
          agent,
          limit: INITIAL_LIMIT,
          cursor: isInitial ? null : (cursorRef.current[agent] ?? null),
        });
      } else {
        const params = new URLSearchParams({
          agent,
          limit: String(INITIAL_LIMIT),
        });
        if (!isInitial && cursorRef.current[agent] != null) {
          params.set("cursor", String(cursorRef.current[agent]));
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

      cursorRef.current[agent] = page.next_cursor;
      const isReset = page.reset === true;

      if (page.records.length === 0 && !isReset) {
        return false;
      }

      if (isInitial || isReset) {
        allRecordsRef.current = {
          ...allRecordsRef.current,
          [agent]: page.records,
        };
        setRecordsByAgent((prev) => ({
          ...prev,
          [agent]: page.records,
        }));
        pendingRef.current = {
          ...pendingRef.current,
          [agent]: [],
        };
      } else {
        const existingIds = new Set(
          (allRecordsRef.current[agent] ?? []).map((record) => record.id)
        );
        const fresh = page.records.filter((record) => !existingIds.has(record.id));
        if (fresh.length > 0) {
          allRecordsRef.current = {
            ...allRecordsRef.current,
            [agent]: [...(allRecordsRef.current[agent] ?? []), ...fresh],
          };
        }
        pendingRef.current = {
          ...pendingRef.current,
          [agent]: [...(pendingRef.current[agent] ?? []), ...page.records],
        };
        scheduleFlush();
      }

      return true;
    },
    [isTauri, scheduleFlush]
  );

  /** Fetch records from Tauri IPC or web API. isInitial=true means full initial load. */
  const fetchRecords = useCallback(
    async (isInitial: boolean) => {
      try {
        const results = await Promise.all(
          CHAT_LOG_AGENTS.map((agent) => fetchRecordsForAgent(agent, isInitial))
        );

        if (isInitial || results.some(Boolean)) {
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (e) {
        // "not found" is not an error state — just empty (task 3.5)
        const msg = String(e);
        if (msg.includes("not found") || msg.includes("No such file")) {
          setRecordsByAgent({});
          allRecordsRef.current = {};
          return;
        }
        setError(msg);
      }
    },
    [fetchRecordsForAgent]
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
      recordsByAgent[agent] ?? [],
    [recordsByAgent]
  );

  const refresh = useCallback(() => fetchRecords(false), [fetchRecords]);

  return {
    allRecords: flattenRecordMap(recordsByAgent),
    allRecordsRef,
    getRecordsForAgent,
    lastUpdated,
    error,
    isTauri,
    refresh,
  };
}
