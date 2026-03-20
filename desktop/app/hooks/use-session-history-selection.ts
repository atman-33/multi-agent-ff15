import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionHistoryThreadSummary } from "@/hooks/use-agent-chat-log";

const THREAD_STORAGE_KEY_PREFIX = "chat_selected_thread:";
const LEGACY_SESSION_STORAGE_KEY_PREFIX = "chat_selected_session:";

function getThreadSelectionStorageKey(agent: string): string {
  return `${THREAD_STORAGE_KEY_PREFIX}${agent}`;
}

function getLegacySessionStorageKey(agent: string): string {
  return `${LEGACY_SESSION_STORAGE_KEY_PREFIX}${agent}`;
}

function normalizeSelectionId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function findThreadBySelectionId(
  summaries: readonly SessionHistoryThreadSummary[],
  selectionId: string | null | undefined
): SessionHistoryThreadSummary | null {
  const normalizedSelectionId = normalizeSelectionId(selectionId);
  if (!normalizedSelectionId) {
    return null;
  }

  return (
    summaries.find((summary) => summary.threadId === normalizedSelectionId) ??
    summaries.find(
      (summary) => summary.latestSessionId === normalizedSelectionId
    ) ??
    summaries.find((summary) => summary.sessionId === normalizedSelectionId) ??
    summaries.find((summary) =>
      summary.sessionIds.includes(normalizedSelectionId)
    ) ??
    null
  );
}

function readPersistedThreadSelection(agent: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeSelectionId(
    localStorage.getItem(getThreadSelectionStorageKey(agent))
  );
}

function readPersistedLegacySessionSelection(agent: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return normalizeSelectionId(
    localStorage.getItem(getLegacySessionStorageKey(agent))
  );
}

function resolveSelectedThread(
  summaries: readonly SessionHistoryThreadSummary[],
  persistedThreadId: string | null,
  persistedLegacySessionId: string | null
): {
  selectedThread: SessionHistoryThreadSummary | null;
  staleSelectionDetected: boolean;
} {
  const normalizedPersistedThreadId = normalizeSelectionId(persistedThreadId);
  if (normalizedPersistedThreadId) {
    const matchedThread = findThreadBySelectionId(
      summaries,
      normalizedPersistedThreadId
    );
    if (matchedThread) {
      return {
        selectedThread: matchedThread,
        staleSelectionDetected: false,
      };
    }
  }

  const normalizedPersistedLegacySessionId = normalizeSelectionId(
    persistedLegacySessionId
  );
  if (normalizedPersistedLegacySessionId) {
    const migratedThread = findThreadBySelectionId(
      summaries,
      normalizedPersistedLegacySessionId
    );
    if (migratedThread) {
      return {
        selectedThread: migratedThread,
        staleSelectionDetected: false,
      };
    }
  }

  return {
    selectedThread: summaries[0] ?? null,
    staleSelectionDetected:
      (normalizedPersistedThreadId !== null ||
        normalizedPersistedLegacySessionId !== null) &&
      summaries.length > 0,
  };
}

export function useSessionHistorySelection(
  agent: string,
  summaries: readonly SessionHistoryThreadSummary[],
  backendSelectedThreadId?: string | null
) {
  const [persistedThreadId, setPersistedThreadId] = useState<string | null>(
    () => readPersistedThreadSelection(agent)
  );
  const [persistedLegacySessionId, setPersistedLegacySessionId] = useState<
    string | null
  >(() => readPersistedLegacySessionSelection(agent));

  useEffect(() => {
    setPersistedThreadId(readPersistedThreadSelection(agent));
    setPersistedLegacySessionId(readPersistedLegacySessionSelection(agent));
  }, [agent]);

  useEffect(() => {
    const normalizedBackendSelectedThreadId = normalizeSelectionId(
      backendSelectedThreadId
    );
    if (!normalizedBackendSelectedThreadId) {
      return;
    }

    const nextThreadId =
      findThreadBySelectionId(summaries, normalizedBackendSelectedThreadId)
        ?.threadId ?? normalizedBackendSelectedThreadId;

    setPersistedThreadId((current) =>
      current === nextThreadId ? current : nextThreadId
    );
    setPersistedLegacySessionId(null);
  }, [backendSelectedThreadId, summaries]);

  const { selectedThread, staleSelectionDetected } = useMemo(
    () =>
      resolveSelectedThread(
        summaries,
        persistedThreadId,
        persistedLegacySessionId
      ),
    [summaries, persistedThreadId, persistedLegacySessionId]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const threadStorageKey = getThreadSelectionStorageKey(agent);
    const legacySessionStorageKey = getLegacySessionStorageKey(agent);

    if (selectedThread?.threadId) {
      localStorage.setItem(threadStorageKey, selectedThread.threadId);
    } else {
      localStorage.removeItem(threadStorageKey);
    }

    localStorage.removeItem(legacySessionStorageKey);
  }, [agent, selectedThread]);

  useEffect(() => {
    if (persistedThreadId === selectedThread?.threadId) {
      return;
    }

    setPersistedThreadId(selectedThread?.threadId ?? null);
  }, [persistedThreadId, selectedThread]);

  useEffect(() => {
    if (persistedLegacySessionId === null) {
      return;
    }

    setPersistedLegacySessionId(null);
  }, [persistedLegacySessionId]);

  const setSelectedThreadId = useCallback((threadId: string | null) => {
    setPersistedThreadId(normalizeSelectionId(threadId));
    setPersistedLegacySessionId(null);
  }, []);

  return {
    browsedSessionIds: selectedThread?.sessionIds ?? null,
    browsedThread: selectedThread,
    selectedThread,
    selectedThreadId: selectedThread?.threadId ?? null,
    setSelectedThreadId,
    staleSelectionDetected,
  };
}
