import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatLogMeta, ChatLogRecord } from "@/lib/chat-timeline";
import {
  buildSessionHistorySummaries,
  type SessionHistorySummary,
} from "@/lib/session-history";
import {
  normalizeRuntimeTargetSnapshot,
  resolveRuntimeTargetSnapshot,
  type RuntimeTargetSnapshot,
} from "@/lib/runtime-target-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatLogPage {
  next_cursor: number;
  records: ChatLogRecord[];
  reset?: boolean;
  total_lines: number;
}

interface SessionHistoryResponse {
  activeRuntimeTarget?: unknown;
  selectedThreadId?: string | null;
  summaries?: SessionHistorySummary[];
  threadSummaries?: SessionHistorySummary[];
  threads?: SessionHistorySummary[];
}

interface TauriBindingStateResponse {
  runtimeTarget?: unknown;
  selectedThreadId?: string | null;
  threads?: SessionHistorySummary[];
}

type AgentRecordMap = Partial<Record<AgentId, ChatLogRecord[]>>;
type AgentCursorMap = Partial<Record<AgentId, number | null>>;
type AgentSessionSummaryMap = Partial<
  Record<AgentId, SessionHistoryThreadSummary[]>
>;
type AgentSelectedThreadMap = Partial<Record<AgentId, string | null>>;
type AgentRuntimeTargetMap = Partial<Record<AgentId, RuntimeTargetSnapshot | null>>;

export type SessionHistoryBindingState =
  | "active"
  | "saved"
  | "missing"
  | "restored";

export interface SessionHistoryThreadSummary extends SessionHistorySummary {
  bindingState: SessionHistoryBindingState;
  latestSessionId: string | null;
  sessionIds: string[];
  threadId: string;
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

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asString(item))
    .filter((item): item is string => item !== null);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function resolveThreadIdFromSelection(
  summaries: readonly SessionHistoryThreadSummary[],
  selectionId: string | null | undefined
): string | null {
  const normalizedSelectionId = asString(selectionId);
  if (!normalizedSelectionId) {
    return null;
  }

  const matchedSummary =
    summaries.find((summary) => summary.threadId === normalizedSelectionId) ??
    summaries.find(
      (summary) => summary.latestSessionId === normalizedSelectionId
    ) ??
    summaries.find((summary) => summary.sessionId === normalizedSelectionId) ??
    summaries.find((summary) =>
      summary.sessionIds.includes(normalizedSelectionId)
    ) ??
    null;

  return matchedSummary?.threadId ?? null;
}

function normalizeBindingState(
  value: unknown
): SessionHistoryBindingState | null {
  switch (value) {
    case "active":
    case "live":
      return "active";
    case "saved":
    case "idle":
      return "saved";
    case "missing":
      return "missing";
    case "restored":
      return "restored";
    default:
      return null;
  }
}

function compareSummaryRecency(
  left: Pick<SessionHistorySummary, "lastActivityAt" | "sessionId">,
  right: Pick<SessionHistorySummary, "lastActivityAt" | "sessionId">
): number {
  const diff =
    new Date(right.lastActivityAt).getTime() -
    new Date(left.lastActivityAt).getTime();
  if (diff !== 0) {
    return diff;
  }

  return left.sessionId.localeCompare(right.sessionId);
}

function bindingStatePriority(state: SessionHistoryBindingState): number {
  switch (state) {
    case "active":
      return 4;
    case "restored":
      return 3;
    case "missing":
      return 2;
    default:
      return 1;
  }
}

function getMostRelevantBindingState(
  left: SessionHistoryBindingState,
  right: SessionHistoryBindingState
): SessionHistoryBindingState {
  return bindingStatePriority(right) > bindingStatePriority(left)
    ? right
    : left;
}

function normalizeSessionHistorySummary(
  summary: SessionHistorySummary
): SessionHistoryThreadSummary {
  const record = summary as SessionHistorySummary & Record<string, unknown>;
  const latestSessionId =
    asString(record.latestSessionId) ??
    asString(record.latest_session_id) ??
    summary.sessionId;
  const sessionIds = uniqueStrings([
    ...asStringArray(record.sessionIds),
    ...asStringArray(record.session_ids),
    ...asStringArray(record.sessionLineage),
    ...asStringArray(record.session_lineage),
    latestSessionId,
    summary.sessionId,
  ]);
  const bindingState =
    normalizeBindingState(record.bindingState) ??
    normalizeBindingState(record.binding_status) ??
    (record.restored === true
      ? "restored"
      : record.missing === true
        ? "missing"
        : summary.isActive
          ? "active"
          : "saved");
  const threadId =
    asString(record.threadId) ??
    asString(record.thread_id) ??
    latestSessionId ??
    summary.sessionId;

  return {
    ...summary,
    bindingState,
    isActive: bindingState === "active" || summary.isActive,
    latestSessionId,
    sessionIds,
    sessionId: latestSessionId ?? summary.sessionId,
    threadId,
  };
}

function mergeSessionHistorySummaries(
  summaries: readonly SessionHistorySummary[]
): SessionHistoryThreadSummary[] {
  const normalized = summaries
    .map(normalizeSessionHistorySummary)
    .sort(compareSummaryRecency);
  const merged = new Map<string, SessionHistoryThreadSummary>();

  for (const summary of normalized) {
    const existing = merged.get(summary.threadId);
    if (!existing) {
      merged.set(summary.threadId, {
        ...summary,
        sessionIds: [...summary.sessionIds],
      });
      continue;
    }

    existing.messageCount += summary.messageCount;
    existing.sessionIds = uniqueStrings([
      ...existing.sessionIds,
      ...summary.sessionIds,
    ]);
    existing.isActive =
      existing.isActive ||
      summary.isActive ||
      summary.bindingState === "active";
    existing.bindingState = getMostRelevantBindingState(
      existing.bindingState,
      summary.bindingState
    );

    if (
      new Date(summary.startedAt).getTime() <
      new Date(existing.startedAt).getTime()
    ) {
      existing.startedAt = summary.startedAt;
    }

    if (compareSummaryRecency(summary, existing) < 0) {
      existing.lastActivityAt = summary.lastActivityAt;
      existing.latestSessionId = summary.latestSessionId;
      existing.preview = summary.preview || existing.preview;
      existing.sessionId = summary.sessionId;
    } else if (!existing.preview && summary.preview) {
      existing.preview = summary.preview;
    }
  }

  return [...merged.values()].sort(compareSummaryRecency);
}

function areSessionSummariesEqual(
  left: readonly SessionHistoryThreadSummary[] | undefined,
  right: readonly SessionHistoryThreadSummary[]
): boolean {
  if (!left || left.length !== right.length) {
    return false;
  }

  return left.every((summary, index) => {
    const candidate = right[index];
    return (
      summary.threadId === candidate.threadId &&
      summary.sessionId === candidate.sessionId &&
      summary.latestSessionId === candidate.latestSessionId &&
      summary.bindingState === candidate.bindingState &&
      summary.lastActivityAt === candidate.lastActivityAt &&
      summary.startedAt === candidate.startedAt &&
      summary.messageCount === candidate.messageCount &&
      summary.preview === candidate.preview &&
      summary.isActive === candidate.isActive &&
      summary.sessionIds.join("\u0000") === candidate.sessionIds.join("\u0000")
    );
  });
}

export function filterChatLogRecordsBySessionIds<T extends ChatLogRecord>(
  records: readonly T[],
  sessionIds?: readonly string[] | null
): T[] {
  if (!sessionIds || sessionIds.length === 0) {
    return [...records];
  }

  const allowedSessionIds = new Set(
    sessionIds.filter((sessionId) => sessionId.trim().length > 0)
  );
  if (allowedSessionIds.size === 0) {
    return [...records];
  }

  return records.filter((record) => allowedSessionIds.has(record.session_id));
}

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
  const [sessionSummariesByAgent, setSessionSummariesByAgent] =
    useState<AgentSessionSummaryMap>({});
  const [selectedThreadIdsByAgent, setSelectedThreadIdsByAgent] =
    useState<AgentSelectedThreadMap>({});
  const [runtimeTargetByAgent, setRuntimeTargetByAgent] =
    useState<AgentRuntimeTargetMap>({});
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
    const pendingEntries = Object.entries(pendingRef.current) as [
      AgentId,
      ChatLogRecord[] | undefined,
    ][];
    if (
      pendingEntries.every(([, records]) => !records || records.length === 0)
    ) {
      return;
    }
    const toAdd = pendingRef.current;
    pendingRef.current = {};
    setRecordsByAgent((prev) => {
      let changed = false;
      const next: AgentRecordMap = { ...prev };

      for (const [agent, records] of Object.entries(toAdd) as [
        AgentId,
        ChatLogRecord[] | undefined,
      ][]) {
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
        const fresh = page.records.filter(
          (record) => !existingIds.has(record.id)
        );
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

  const fetchSessionHistoryForAgent = useCallback(
    async (
      agent: AgentId
    ): Promise<{
      activeRuntimeTarget: RuntimeTargetSnapshot | null;
      selectedThreadId: string | null;
      summaries: SessionHistoryThreadSummary[];
    }> => {
      if (isTauri) {
        const [historyResponse, bindingStateResponse] = await Promise.all([
          invoke<SessionHistorySummary[] | SessionHistoryResponse>(
            "read_agent_session_history",
            {
              agent,
            }
          ),
          invoke<TauriBindingStateResponse>(
            "read_agent_session_binding_state",
            {
              agent,
            }
          ).catch(() => null),
        ]);
        const response = historyResponse;
        const tauriThreads = bindingStateResponse?.threads ?? [];
        const summaries =
          tauriThreads.length > 0
            ? tauriThreads
            : Array.isArray(response)
              ? response
              : Array.isArray(response?.threadSummaries)
                ? response.threadSummaries
                : Array.isArray(response?.threads)
                  ? response.threads
                  : Array.isArray(response?.summaries)
                    ? response.summaries
                    : [];
        const selectedThreadId =
          typeof bindingStateResponse?.selectedThreadId === "string"
            ? bindingStateResponse.selectedThreadId
            : !Array.isArray(response) &&
                typeof response?.selectedThreadId === "string"
              ? response.selectedThreadId
              : null;
        const mergedSummaries = mergeSessionHistorySummaries(summaries);

        const resolvedSelectedThreadId = resolveThreadIdFromSelection(
          mergedSummaries,
          selectedThreadId
        );
        const normalizedRuntimeTarget = normalizeRuntimeTargetSnapshot(
          bindingStateResponse?.runtimeTarget
        );

        return {
          activeRuntimeTarget: resolveRuntimeTargetSnapshot(
            normalizedRuntimeTarget,
            mergedSummaries,
            resolvedSelectedThreadId
          ),
          selectedThreadId: resolvedSelectedThreadId,
          summaries: mergedSummaries,
        };
      }

      const params = new URLSearchParams({ agent });
      const res = await fetch(`/api/session-history?${params}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const payload = (await res.json()) as SessionHistoryResponse & {
        error?: string;
      };
      if (payload.error) {
        throw new Error(payload.error);
      }

      const summaries = payload.threadSummaries ?? payload.summaries ?? [];
      const mergedSummaries = mergeSessionHistorySummaries(summaries);

      const resolvedSelectedThreadId = resolveThreadIdFromSelection(
        mergedSummaries,
        typeof payload.selectedThreadId === "string"
          ? payload.selectedThreadId
          : null
      );
      const normalizedRuntimeTarget = normalizeRuntimeTargetSnapshot(
        payload.activeRuntimeTarget
      );

      return {
        activeRuntimeTarget: resolveRuntimeTargetSnapshot(
          normalizedRuntimeTarget,
          mergedSummaries,
          resolvedSelectedThreadId
        ),
        selectedThreadId: resolvedSelectedThreadId,
        summaries: mergedSummaries,
      };
    },
    [isTauri]
  );

  const fetchSessionHistories = useCallback(async () => {
    const results = await Promise.all(
      CHAT_LOG_AGENTS.map(async (agent) => {
        const history = await fetchSessionHistoryForAgent(agent);
        return [agent, history] as const;
      })
    );

    let changed = false;
    setSessionSummariesByAgent((prev) => {
      const next: AgentSessionSummaryMap = { ...prev };

      for (const [agent, history] of results) {
        if (areSessionSummariesEqual(prev[agent], history.summaries)) {
          continue;
        }

        next[agent] = history.summaries;
        changed = true;
      }

      return changed ? next : prev;
    });

    setSelectedThreadIdsByAgent((prev) => {
      let next: AgentSelectedThreadMap | null = null;

      for (const [agent, history] of results) {
        const selectedThreadId = history.selectedThreadId ?? null;
        if ((prev[agent] ?? null) === selectedThreadId) {
          continue;
        }

        if (next === null) {
          next = { ...prev };
        }
        next[agent] = selectedThreadId;
      }

      return next ?? prev;
    });

    setRuntimeTargetByAgent((prev) => {
      let next: AgentRuntimeTargetMap | null = null;

      for (const [agent, history] of results) {
        const previous = prev[agent] ?? null;
        const normalized = history.activeRuntimeTarget;
        const changedForAgent =
          (previous?.selectedThreadId ?? null) !==
            (normalized?.selectedThreadId ?? null) ||
          (previous?.selectedSessionId ?? null) !==
            (normalized?.selectedSessionId ?? null) ||
          (previous?.switchStatus ?? null) !==
            (normalized?.switchStatus ?? null) ||
          (previous?.transportMode ?? null) !==
            (normalized?.transportMode ?? null) ||
          (previous?.lastError ?? null) !== (normalized?.lastError ?? null) ||
          (previous?.updatedAt ?? null) !== (normalized?.updatedAt ?? null);

        if (!changedForAgent) {
          continue;
        }

        if (next === null) {
          next = { ...prev };
        }
        next[agent] = normalized;
      }

      return next ?? prev;
    });

    return changed;
  }, [fetchSessionHistoryForAgent]);

  /** Fetch records from Tauri IPC or web API. isInitial=true means full initial load. */
  const fetchRecords = useCallback(
    async (isInitial: boolean) => {
      try {
        const [results, sessionHistoryChanged] = await Promise.all([
          Promise.all(
            CHAT_LOG_AGENTS.map((agent) =>
              fetchRecordsForAgent(agent, isInitial)
            )
          ),
          fetchSessionHistories(),
        ]);

        if (isInitial || results.some(Boolean) || sessionHistoryChanged) {
          setError(null);
          setLastUpdated(new Date());
        }
      } catch (e) {
        // "not found" is not an error state — just empty (task 3.5)
        const msg = String(e);
        if (msg.includes("not found") || msg.includes("No such file")) {
          setRecordsByAgent({});
          setSessionSummariesByAgent({});
          allRecordsRef.current = {};
          return;
        }
        setError(msg);
      }
    },
    [fetchRecordsForAgent, fetchSessionHistories]
  );

  const getFallbackSessionSummariesForAgent = useCallback(
    (agent: AgentId) =>
      mergeSessionHistorySummaries(
        buildSessionHistorySummaries(agent, recordsByAgent[agent] ?? [])
      ),
    [recordsByAgent]
  );

  /**
   * Returns records filtered by agent name (task 3.3).
   * Memoization is handled by the caller via useMemo if needed.
   */
  const getRecordsForAgent = useCallback(
    (
      agent: AgentId,
      selectedSessionIds?: readonly string[] | null
    ): ChatLogRecord[] =>
      filterChatLogRecordsBySessionIds(
        recordsByAgent[agent] ?? [],
        selectedSessionIds
      ),
    [recordsByAgent]
  );

  const getSessionSummariesForAgent = useCallback(
    (agent: AgentId) =>
      sessionSummariesByAgent[agent] ??
      getFallbackSessionSummariesForAgent(agent),
    [getFallbackSessionSummariesForAgent, sessionSummariesByAgent]
  );

  const getSelectedThreadIdForAgent = useCallback(
    (agent: AgentId) => selectedThreadIdsByAgent[agent] ?? null,
    [selectedThreadIdsByAgent]
  );

  const getRuntimeTargetForAgent = useCallback(
    (agent: AgentId) => runtimeTargetByAgent[agent] ?? null,
    [runtimeTargetByAgent]
  );

  const setRuntimeTargetForAgent = useCallback(
    (agent: AgentId, target: RuntimeTargetSnapshot | null) => {
      setRuntimeTargetByAgent((prev) => {
        const previous = prev[agent] ?? null;
        if (
          (previous?.selectedThreadId ?? null) ===
            (target?.selectedThreadId ?? null) &&
          (previous?.selectedSessionId ?? null) ===
            (target?.selectedSessionId ?? null) &&
          (previous?.switchStatus ?? null) ===
            (target?.switchStatus ?? null) &&
          (previous?.transportMode ?? null) ===
            (target?.transportMode ?? null)
        ) {
          return prev;
        }
        return { ...prev, [agent]: target };
      });
    },
    []
  );

  const refresh = useCallback(() => fetchRecords(false), [fetchRecords]);

  useEffect(() => {
    fetchRecords(true);
  }, [fetchRecords]);

  useEffect(() => {
    const timer = setInterval(() => fetchRecords(false), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchRecords]);

  useEffect(() => {
    return () => {
      if (bufferTimerRef.current) {
        clearTimeout(bufferTimerRef.current);
      }
    };
  }, []);

  return {
    allRecords: flattenRecordMap(recordsByAgent),
    allRecordsRef,
    getRecordsForAgent,
    getRuntimeTargetForAgent,
    getSelectedThreadIdForAgent,
    getSessionSummariesForAgent,
    lastUpdated,
    error,
    isTauri,
    refresh,
    setRuntimeTargetForAgent,
  };
}
