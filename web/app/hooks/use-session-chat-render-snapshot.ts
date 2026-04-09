import { useEffect, useMemo, useRef } from "react";
import {
  buildSessionChatRenderSnapshot,
  type SessionChatRenderSnapshot,
} from "@/lib/session-chat-rendering-orchestration";
import type { SessionPresentationMessage } from "@/lib/session-message-presentation";

type StreamingTextInput = NonNullable<SessionChatRenderSnapshot["input"]["streamingText"]>;

export function useSessionChatRenderSnapshot({
  messages,
  streamingText = null,
}: {
  messages: SessionPresentationMessage[];
  streamingText?: StreamingTextInput | null;
}): SessionChatRenderSnapshot {
  const previousSnapshotRef = useRef<SessionChatRenderSnapshot | null>(null);

  const snapshot = useMemo(
    () =>
      buildSessionChatRenderSnapshot({
        messages,
        previousSnapshot: previousSnapshotRef.current,
        streamingText,
      }),
    [messages, streamingText],
  );

  useEffect(() => {
    previousSnapshotRef.current = snapshot;
  }, [snapshot]);

  return snapshot;
}