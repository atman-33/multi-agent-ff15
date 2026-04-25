import { useCallback, useEffect, useRef, useState } from "react";
import {
  mergeSessionLiveDraft,
  mergeStreamingText,
  parseSessionLiveEvent,
  type SessionLiveDraft,
  type SessionTextPartEvent,
} from "@/lib/session-stream";
import { coerceSessionStatus, type SessionStatus } from "@/lib/session-status";

type LivePayload = Record<string, unknown>;

export type UseSessionLiveThreadOptions = {
  enabled?: boolean;
  onSessionIdle?: (sessionId: string) => void;
  onSessionStatus?: (status: SessionStatus, sessionId: string) => void;
  onTextPartMatched?: (event: SessionTextPartEvent) => boolean;
  onUnhandledEvent?: (payload: LivePayload) => void;
  sessionId: string | null;
};

export type UseSessionLiveThreadResult = {
  clearStreaming: () => void;
  isLiveUnavailable: boolean;
  liveDraft: SessionLiveDraft | null;
  resetLiveThread: () => void;
  streamingContent: string;
  streamingMessageId: string | null;
};

export function useSessionLiveThread({
  enabled = true,
  onSessionIdle,
  onSessionStatus,
  onTextPartMatched,
  onUnhandledEvent,
  sessionId,
}: UseSessionLiveThreadOptions): UseSessionLiveThreadResult {
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [liveDraft, setLiveDraft] = useState<SessionLiveDraft | null>(null);
  const [isLiveUnavailable, setIsLiveUnavailable] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onSessionIdleRef = useRef(onSessionIdle);
  const onSessionStatusRef = useRef(onSessionStatus);
  const onTextPartMatchedRef = useRef(onTextPartMatched);
  const onUnhandledEventRef = useRef(onUnhandledEvent);
  const streamingMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    onSessionIdleRef.current = onSessionIdle;
    onSessionStatusRef.current = onSessionStatus;
    onTextPartMatchedRef.current = onTextPartMatched;
    onUnhandledEventRef.current = onUnhandledEvent;
  }, [onSessionIdle, onSessionStatus, onTextPartMatched, onUnhandledEvent]);

  const clearStreaming = useCallback(() => {
    streamingMessageIdRef.current = null;
    setLiveDraft(null);
    setStreamingContent("");
    setStreamingMessageId(null);
  }, []);

  const resetLiveThread = useCallback(() => {
    clearStreaming();
    setIsLiveUnavailable(false);
  }, [clearStreaming]);

  useEffect(() => {
    if (!enabled || !sessionId || typeof window === "undefined") {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      resetLiveThread();
      return;
    }

    resetLiveThread();

    const source = new EventSource(`/api/session/${sessionId}/events`);
    eventSourceRef.current = source;

    source.onmessage = (event) => {
      let parsed: LivePayload;
      try {
        parsed = JSON.parse(event.data as string) as LivePayload;
      } catch {
        return;
      }

      const liveEvent = parseSessionLiveEvent(parsed);
      if (!liveEvent) {
        onUnhandledEventRef.current?.(parsed);
        return;
      }

      if (liveEvent.kind === "part") {
        if (liveEvent.sessionId && liveEvent.sessionId !== sessionId) {
          return;
        }

        const textPartEvent: SessionTextPartEvent | null =
          liveEvent.part.type === "text" && typeof liveEvent.part.text === "string"
            ? {
                messageId: liveEvent.messageId,
                sessionId: liveEvent.sessionId,
                text: liveEvent.part.text,
              }
            : null;

        if (textPartEvent && onTextPartMatchedRef.current?.(textPartEvent)) {
          clearStreaming();
          return;
        }

        setLiveDraft((current) => mergeSessionLiveDraft(current, liveEvent));

        const previousStreamingMessageId = streamingMessageIdRef.current;
        streamingMessageIdRef.current = liveEvent.messageId;
        setStreamingMessageId(liveEvent.messageId);

        if (textPartEvent) {
          setStreamingContent((current) =>
            mergeStreamingText(
              textPartEvent.messageId === previousStreamingMessageId ? current : "",
              textPartEvent.text,
            ),
          );
        }
        return;
      }

      if (liveEvent.kind === "status") {
        const eventSessionId = liveEvent.sessionId ?? sessionId;
        const nextStatus = coerceSessionStatus(liveEvent.status);
        if (eventSessionId && nextStatus) {
          onSessionStatusRef.current?.(nextStatus, eventSessionId);
        }
        return;
      }

      const eventSessionId = liveEvent.sessionId ?? sessionId;
      clearStreaming();
      onSessionStatusRef.current?.("idle", eventSessionId);
      onSessionIdleRef.current?.(eventSessionId);
    };

    source.onerror = () => {
      setIsLiveUnavailable(true);
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    };

    return () => {
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    };
  }, [
    clearStreaming,
    enabled,
    resetLiveThread,
    sessionId,
  ]);

  return {
    clearStreaming,
    isLiveUnavailable,
    liveDraft,
    resetLiveThread,
    streamingContent,
    streamingMessageId,
  };
}