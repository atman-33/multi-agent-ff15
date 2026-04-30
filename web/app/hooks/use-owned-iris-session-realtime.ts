import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSessionStatus, isSessionStatusActive, type SessionStatus } from "@/lib/session-status";
import {
  useSessionLiveThread,
  type UseSessionLiveThreadOptions,
  type UseSessionLiveThreadResult,
} from "./use-session-live-thread";

export type UseOwnedIrisSessionRealtimeOptions = {
  enabled?: boolean;
  loadMessages: (sessionId: string) => Promise<void>;
  onSessionIdle?: (sessionId: string) => void | Promise<void>;
  onTextPartMatched?: UseSessionLiveThreadOptions["onTextPartMatched"];
  onUnhandledEvent?: UseSessionLiveThreadOptions["onUnhandledEvent"];
  pollingIntervalMs?: number;
  sessionId: string | null;
};

export type UseOwnedIrisSessionRealtimeResult = UseSessionLiveThreadResult & {
  sessionStatus: SessionStatus | null;
};

export function useOwnedIrisSessionRealtime({
  enabled = true,
  loadMessages,
  onSessionIdle,
  onTextPartMatched,
  onUnhandledEvent,
  pollingIntervalMs = 2500,
  sessionId,
}: UseOwnedIrisSessionRealtimeOptions): UseOwnedIrisSessionRealtimeResult {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const sessionIdRef = useRef<string | null>(sessionId);
  const statusRequestIdRef = useRef(0);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const refreshSessionStatus = useCallback(async (targetSessionId: string) => {
    const requestId = statusRequestIdRef.current + 1;
    statusRequestIdRef.current = requestId;

    try {
      const nextStatus = await fetchSessionStatus(targetSessionId);
      if (statusRequestIdRef.current !== requestId || sessionIdRef.current !== targetSessionId) {
        return;
      }

      setSessionStatus(nextStatus);
    } catch {
      // Keep the last known status until a future poll or session event settles it.
    }
  }, []);

  useEffect(() => {
    if (!enabled || !sessionId) {
      statusRequestIdRef.current += 1;
      setSessionStatus(null);
      return;
    }

    void refreshSessionStatus(sessionId);
  }, [enabled, refreshSessionStatus, sessionId]);

  const handleSessionIdle = useCallback(
    (eventSessionId: string) => {
      if (eventSessionId !== sessionId) {
        return;
      }

      setSessionStatus("idle");
      void loadMessages(eventSessionId);
      void onSessionIdle?.(eventSessionId);
    },
    [loadMessages, onSessionIdle, sessionId],
  );

  const handleSessionStatus = useCallback(
    (nextStatus: SessionStatus, eventSessionId: string) => {
      if (eventSessionId !== sessionId) {
        return;
      }

      setSessionStatus(nextStatus);
    },
    [sessionId],
  );

  const liveThread = useSessionLiveThread({
    enabled,
    onSessionIdle: handleSessionIdle,
    onSessionStatus: handleSessionStatus,
    onTextPartMatched,
    onUnhandledEvent,
    sessionId,
  });

  useEffect(() => {
    if (!enabled || !sessionId || !liveThread.isLiveUnavailable || !isSessionStatusActive(sessionStatus)) {
      return;
    }

    const activeSessionId = sessionId;
    const interval = window.setInterval(() => {
      void loadMessages(activeSessionId);
      void refreshSessionStatus(activeSessionId);
    }, pollingIntervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    enabled,
    liveThread.isLiveUnavailable,
    loadMessages,
    pollingIntervalMs,
    refreshSessionStatus,
    sessionId,
    sessionStatus,
  ]);

  return {
    ...liveThread,
    sessionStatus,
  };
}