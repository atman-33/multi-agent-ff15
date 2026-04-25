import { useEffect, useMemo, useRef } from "react";
import {
  buildSessionChatRenderSnapshot,
  type SessionChatRenderSnapshot,
} from "@/lib/session-chat-rendering-orchestration";
import type { SessionPresentationMessage } from "@/lib/session-message-presentation";

type LiveDraftInput = NonNullable<SessionChatRenderSnapshot["input"]["liveDraft"]>;
type StreamingTextInput = NonNullable<SessionChatRenderSnapshot["input"]["streamingText"]>;

export function useSessionChatRenderSnapshot({
  assistantPending = false,
  liveDraft = null,
  messages,
  streamingText = null,
}: {
  assistantPending?: boolean;
  liveDraft?: LiveDraftInput | null;
  messages: SessionPresentationMessage[];
  streamingText?: StreamingTextInput | null;
}): SessionChatRenderSnapshot {
  const previousSnapshotRef = useRef<SessionChatRenderSnapshot | null>(null);

  const snapshot = useMemo(
    () =>
      buildSessionChatRenderSnapshot({
        assistantPending,
        liveDraft,
        messages,
        previousSnapshot: previousSnapshotRef.current,
        streamingText,
      }),
    [assistantPending, liveDraft, messages, streamingText],
  );

  useEffect(() => {
    previousSnapshotRef.current = snapshot;
  }, [snapshot]);

  return snapshot;
}