import { useEffect, useRef } from "react";
import {
  coerceSessionStatus,
  fetchSessionStatuses,
  isSessionStatusActive,
  type SessionStatus,
} from "@/lib/session-status";
import { useChatStore } from "@/stores/chat-store";

type SessionStatusEventPayload = {
  type: string;
  properties: {
    sessionID?: string;
    status?: {
      type?: SessionStatus;
    };
  };
};

export function useSessionStatusFeed(options?: {
  enabled?: boolean;
  onSessionIdle?: (sessionId: string) => void;
}): Record<string, SessionStatus> {
  const enabled = options?.enabled ?? true;
  const onSessionIdle = options?.onSessionIdle;
  const sessionStates = useChatStore((state) => state.sessionStates);
  const setServerSessionState = useChatStore((state) => state.setServerSessionState);
  const replaceServerSessionStates = useChatStore((state) => state.replaceServerSessionStates);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    void fetchSessionStatuses()
      .then((statuses) => {
        if (!cancelled) {
          replaceServerSessionStates(statuses);
        }
      })
      .catch(() => undefined);

    const source = new EventSource("/api/event-stream");
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data as string) as
        | { payload?: SessionStatusEventPayload }
        | SessionStatusEventPayload;
      const actual = ("payload" in payload ? payload.payload : payload) as SessionStatusEventPayload;
      if (!actual?.type) {
        return;
      }

      if (actual.type === "session.status") {
        const eventSessionId = actual.properties.sessionID;
        const nextStatus = coerceSessionStatus(actual.properties.status?.type);
        if (eventSessionId && nextStatus) {
          setServerSessionState(eventSessionId, nextStatus);
        }
      }

      if (actual.type === "session.idle") {
        const eventSessionId = actual.properties.sessionID;
        if (eventSessionId) {
          setServerSessionState(eventSessionId, "idle");
          onSessionIdle?.(eventSessionId);
        }
      }
    };
    source.onerror = () => {
      source.close();
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, [enabled, onSessionIdle, replaceServerSessionStates, setServerSessionState]);

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const hasBusy = Object.values(sessionStates).some((status) => isSessionStatusActive(status));

    if (hasBusy && !pollingIntervalRef.current) {
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const statuses = await fetchSessionStatuses();
          replaceServerSessionStates(statuses);
        } catch (_) {
          void _;
        }
      }, 3000);
    }

    if (!hasBusy && pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [enabled, replaceServerSessionStates, sessionStates]);

  return sessionStates;
}