import { useEffect, useMemo, useRef } from "react";
import {
  buildSessionChatRenderSnapshot,
  type SessionChatRenderSnapshot,
} from "@/lib/session-chat-rendering-orchestration";
import type {
  SessionContinuityAssistant,
  SessionPresentationMessage,
} from "@/lib/session-message-presentation";

type LiveDraftInput = NonNullable<SessionChatRenderSnapshot["input"]["liveDraft"]>;
type StreamingTextInput = NonNullable<SessionChatRenderSnapshot["input"]["streamingText"]>;

export function useSessionChatRenderSnapshot({
  assistantPending = false,
  continuityAssistant,
  currentStreamingMessageId = null,
  liveDraft = null,
  messages,
  onStreamingMessageCommitted,
  streamingText = null,
}: {
  assistantPending?: boolean;
  continuityAssistant?: SessionContinuityAssistant | null;
  currentStreamingMessageId?: string | null;
  liveDraft?: LiveDraftInput | null;
  messages: SessionPresentationMessage[];
  onStreamingMessageCommitted?: (messageId: string) => void;
  streamingText?: StreamingTextInput | null;
}): SessionChatRenderSnapshot {
  const committedStreamingMessageIdRef = useRef<string | null>(null);
  const previousSnapshotRef = useRef<SessionChatRenderSnapshot | null>(null);

  const snapshot = useMemo(
    () =>
      buildSessionChatRenderSnapshot({
        assistantPending,
        continuityAssistant,
        currentStreamingMessageId,
        liveDraft,
        messages,
        previousSnapshot: previousSnapshotRef.current,
        streamingText,
      }),
    [
      assistantPending,
      continuityAssistant,
      currentStreamingMessageId,
      liveDraft,
      messages,
      streamingText,
    ],
  );

  useEffect(() => {
    previousSnapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (!currentStreamingMessageId) {
      committedStreamingMessageIdRef.current = null;
      return;
    }

    if (
      !onStreamingMessageCommitted ||
      committedStreamingMessageIdRef.current === currentStreamingMessageId ||
      !messages.some((message) => message.id === currentStreamingMessageId)
    ) {
      return;
    }

    committedStreamingMessageIdRef.current = currentStreamingMessageId;
    onStreamingMessageCommitted(currentStreamingMessageId);
  }, [currentStreamingMessageId, messages, onStreamingMessageCommitted]);

  return snapshot;
}