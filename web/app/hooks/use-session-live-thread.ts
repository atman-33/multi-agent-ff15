import { useCallback, useEffect, useRef, useState } from "react";
import {
  mergeStreamingText,
  parseSessionTextPartEvent,
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

      const textPartEvent = parseSessionTextPartEvent(parsed);
      if (textPartEvent && (!textPartEvent.sessionId || textPartEvent.sessionId === sessionId)) {
        if (onTextPartMatchedRef.current?.(textPartEvent)) {
          clearStreaming();
          return;
        }

        const previousStreamingMessageId = streamingMessageIdRef.current;
        streamingMessageIdRef.current = textPartEvent.messageId;
        setStreamingMessageId(textPartEvent.messageId);
        setStreamingContent((current) =>
          mergeStreamingText(
            textPartEvent.messageId === previousStreamingMessageId ? current : "",
            textPartEvent.text,
          ),
        );
        return;
      }

      const type = typeof parsed.type === "string" ? parsed.type : null;
      if (!type) {
        return;
      }

      if (type === "session.status") {
        const properties = parsed.properties as
          | {
              sessionID?: unknown;
              status?: {
                type?: unknown;
              };
            }
          | undefined;
        const eventSessionId =
          typeof properties?.sessionID === "string" ? properties.sessionID : sessionId;
        const nextStatus = coerceSessionStatus(properties?.status?.type);
        if (eventSessionId && nextStatus) {
          onSessionStatusRef.current?.(nextStatus, eventSessionId);
        }
        return;
      }

      if (type === "session.idle") {
        const properties = parsed.properties as { sessionID?: unknown } | undefined;
        const eventSessionId =
          typeof properties?.sessionID === "string" ? properties.sessionID : sessionId;

        clearStreaming();
        onSessionStatusRef.current?.("idle", eventSessionId);
        onSessionIdleRef.current?.(eventSessionId);
        return;
      }

      onUnhandledEventRef.current?.(parsed);
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
    resetLiveThread,
    streamingContent,
    streamingMessageId,
  };
}