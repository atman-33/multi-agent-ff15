import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentId } from "@/lib/use-agent-chat-log";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InboxLogRecord {
  content: string;
  from: string;
  id: string;
  to: string;
  ts: string;
  type: string;
}

interface InboxLogPage {
  next_cursor: number;
  records: InboxLogRecord[];
  reset?: boolean;
  total_lines: number;
}

const POLL_INTERVAL_MS = 3000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useInboxLog
 *
 * Reads and polls `runtime/logs/inbox-log.jsonl` — the unified log written by
 * `inbox_write.sh` for every sent inbox message (Crystal→Agent, Agent→Agent).
 *
 * - Initial load: fetches all records (up to 200) filtered by `to` field.
 * - Polling: cursor-based incremental fetch every 3 s.
 * - `getMessagesForAgent(agent)`: returns records where `to === agent`.
 * - Works in both Tauri IPC and web (fetch) modes.
 */
export function useInboxLog() {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const [allRecords, setAllRecords] = useState<InboxLogRecord[]>([]);
  const cursorRef = useRef<number | null>(null);

  const fetchRecords = useCallback(
    async (isInitial: boolean) => {
      try {
        let page: InboxLogPage;
        if (isTauri) {
          page = await invoke<InboxLogPage>("read_inbox_log", {
            cursor: isInitial ? null : (cursorRef.current ?? null),
          });
        } else {
          const params = new URLSearchParams();
          if (!isInitial && cursorRef.current != null) {
            params.set("cursor", String(cursorRef.current));
          }
          const res = await fetch(`/api/inbox-log?${params}`);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          page = (await res.json()) as InboxLogPage;
        }

        cursorRef.current = page.next_cursor;

        const isReset = (page as any).reset === true;

        if (page.records.length === 0 && !isReset) {
          return;
        }

        if (isInitial || isReset) {
          setAllRecords(page.records);
        } else {
          setAllRecords((prev) => {
            const existingIds = new Set(prev.map((r) => r.id));
            const fresh = page.records.filter((r) => !existingIds.has(r.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
        }
      } catch {
        // Silently swallow — file may not exist yet
      }
    },
    [isTauri]
  );

  useEffect(() => {
    fetchRecords(true);
  }, [fetchRecords]);

  useEffect(() => {
    const timer = setInterval(() => fetchRecords(false), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchRecords]);

  const getMessagesForAgent = useCallback(
    (agent: AgentId): InboxLogRecord[] =>
      allRecords.filter((r) => r.to === agent),
    [allRecords]
  );

  return {
    allRecords,
    getMessagesForAgent,
    refresh: () => fetchRecords(false),
  };
}
