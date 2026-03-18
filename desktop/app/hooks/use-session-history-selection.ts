import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getSessionSelectionStorageKey,
  resolveSelectedSessionId,
  type SessionHistorySummary,
} from "@/lib/session-history";

function readPersistedSelection(agent: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem(getSessionSelectionStorageKey(agent));
}

export function useSessionHistorySelection(
  agent: string,
  summaries: readonly SessionHistorySummary[]
) {
  const [persistedSelection, setPersistedSelection] = useState<string | null>(
    () => readPersistedSelection(agent)
  );

  useEffect(() => {
    setPersistedSelection(readPersistedSelection(agent));
  }, [agent]);

  const selectedSessionId = useMemo(
    () => resolveSelectedSessionId(summaries, persistedSelection),
    [summaries, persistedSelection]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storageKey = getSessionSelectionStorageKey(agent);
    if (selectedSessionId) {
      localStorage.setItem(storageKey, selectedSessionId);
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [agent, selectedSessionId]);

  useEffect(() => {
    if (persistedSelection === selectedSessionId) {
      return;
    }

    setPersistedSelection(selectedSessionId);
  }, [persistedSelection, selectedSessionId]);

  const setSelectedSessionId = useCallback((sessionId: string | null) => {
    setPersistedSelection(sessionId);
  }, []);

  return {
    selectedSessionId,
    setSelectedSessionId,
  };
}
