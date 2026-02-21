import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { InboxLogRecord } from "@/lib/useInboxLog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const COMRADES = ["ignis", "gladiolus", "prompto", "iris"] as const;
export type ComradeId = (typeof COMRADES)[number];

export const COMRADE_CONFIG: Record<
  ComradeId,
  { label: string; imageSrc: string }
> = {
  ignis: { label: "Ignis", imageSrc: "/images/ignis.png" },
  gladiolus: { label: "Gladiolus", imageSrc: "/images/gladiolus.png" },
  prompto: { label: "Prompto", imageSrc: "/images/prompto.png" },
  iris: { label: "Iris", imageSrc: "/images/iris.png" },
};

interface InboxLogPage {
  records: InboxLogRecord[];
  next_cursor: number;
  total_lines: number;
}

const POLL_INTERVAL_MS = 3_000;
/** Iris has no explicit task_report flow → time-out busy indicator after 60 s. */
const IRIS_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Busy computation
// ---------------------------------------------------------------------------

/**
 * Determine busy state for each comrade from inbox-log.jsonl records.
 *
 * - Ignis / Gladiolus / Prompto:
 *   busy = last `to: agent` ts  > last `from: agent` ts
 *   (i.e. a task was assigned after the latest report came back)
 *
 * - Iris:
 *   Same logic, but with a 60-second timeout fallback:
 *   if iris hasn't replied within IRIS_TIMEOUT_MS the indicator turns off.
 */
function computeBusyMap(
  records: InboxLogRecord[],
  now: number
): Record<ComradeId, boolean> {
  const busyMap = {} as Record<ComradeId, boolean>;

  for (const agent of COMRADES) {
    if (agent === "iris") {
      // Iris: any incoming message triggers busy; timeout after IRIS_TIMEOUT_MS
      const lastTo = [...records].reverse().find((r) => r.to === agent);
      const lastFrom = [...records].reverse().find((r) => r.from === agent);
      if (!lastTo) { busyMap[agent] = false; continue; }
      const assignTs = new Date(lastTo.ts).getTime();
      const replyTs = lastFrom ? new Date(lastFrom.ts).getTime() : 0;
      busyMap[agent] = replyTs < assignTs && now - assignTs < IRIS_TIMEOUT_MS;
    } else {
      // Ignis / Gladiolus / Prompto: busy only when task_assigned, idle on task_report
      const lastAssigned = [...records].reverse().find(
        (r) => r.to === agent && r.type === "task_assigned"
      );
      const lastReport = [...records].reverse().find(
        (r) => r.from === agent && r.type === "report_received"
      );
      if (!lastAssigned) { busyMap[agent] = false; continue; }
      const assignTs = new Date(lastAssigned.ts).getTime();
      const reportTs = lastReport ? new Date(lastReport.ts).getTime() : 0;
      busyMap[agent] = reportTs < assignTs;
    }
  }

  return busyMap;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useComradeStatus
 *
 * Polls `runtime/logs/inbox-log.jsonl` (all records, no agent filter) every
 * 3 seconds and derives a `busyMap` for ignis, gladiolus, prompto, and iris.
 *
 * Works in both Tauri IPC and web (fetch) mode.
 */
export function useComradeStatus() {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const [allRecords, setAllRecords] = useState<InboxLogRecord[]>([]);
  // Use current time updated on each poll to re-evaluate Iris timeout correctly
  const [now, setNow] = useState<number>(() => Date.now());
  const cursorRef = useRef<number | null>(null);

  const fetchRecords = useCallback(
    async (isInitial: boolean) => {
      try {
        let page: InboxLogPage;
        if (isTauri) {
          // read_inbox_log returns ALL records (no agent filter)
          page = await invoke<InboxLogPage>("read_inbox_log", {
            cursor: isInitial ? null : cursorRef.current ?? null,
          });
        } else {
          // No ?agent= param → api.inbox-log.ts returns all records
          const params = new URLSearchParams();
          if (!isInitial && cursorRef.current != null) {
            params.set("cursor", String(cursorRef.current));
          }
          const res = await fetch(`/api/inbox-log?${params}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          page = (await res.json()) as InboxLogPage;
        }

        cursorRef.current = page.next_cursor;
        setNow(Date.now());

        if (page.records.length === 0) return;

        if (isInitial) {
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
    const interval = setInterval(() => fetchRecords(false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchRecords]);

  const busyMap = useMemo(
    () => computeBusyMap(allRecords, now),
    [allRecords, now]
  );

  return { busyMap };
}
