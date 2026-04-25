import { useEffect, useMemo, useRef } from "react";
import {
  buildSessionChatRenderSnapshot,
  type SessionChatRenderSnapshot,
} from "@/lib/session-chat-rendering-orchestration";
import type { SessionPresentationMessage } from "@/lib/session-message-presentation";

type LiveDraftInput = NonNullable<SessionChatRenderSnapshot["input"]["liveDraft"]>;
type StreamingTextInput = NonNullable<SessionChatRenderSnapshot["input"]["streamingText"]>;

export function useSessionChatRenderSnapshot({
  liveDraft = null,
  messages,
  streamingText = null,
}: {
  liveDraft?: LiveDraftInput | null;
  messages: SessionPresentationMessage[];
  streamingText?: StreamingTextInput | null;
}): SessionChatRenderSnapshot {
  const previousSnapshotRef = useRef<SessionChatRenderSnapshot | null>(null);

  const snapshot = useMemo(
    () =>
      buildSessionChatRenderSnapshot({
        liveDraft,
        messages,
        previousSnapshot: previousSnapshotRef.current,
        streamingText,
      }),
    [liveDraft, messages, streamingText],
  );

  useEffect(() => {
    previousSnapshotRef.current = snapshot;
  }, [snapshot]);

  return snapshot;
}