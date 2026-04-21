import { stringifyPromptParts, type PromptPart } from "@/lib/prompt-parts";
import type { SessionPresentationMessage } from "@/lib/session-message-presentation";
import { mergeStreamingText } from "@/lib/session-stream";
import { isSessionStatusActive, type SessionStatus } from "@/lib/session-status";

export type OperationsIrisOptimisticMessage = {
  baselineMessageCount: number;
  message: SessionPresentationMessage;
};

export function createOperationsIrisOptimisticMessage(input: {
  baselineMessageCount: number;
  parts: PromptPart[];
  timestamp?: Date;
}): OperationsIrisOptimisticMessage {
  const timestamp = input.timestamp ?? new Date();
  const content = stringifyPromptParts(input.parts);

  return {
    baselineMessageCount: input.baselineMessageCount,
    message: {
      id: `iris-optimistic-user:${timestamp.toISOString()}`,
      role: "user",
      sender: "user",
      senderLabel: "User",
      kind: "user_message",
      content,
      detailContent: content,
      rawText: content,
      parts: [{ type: "text", text: content }],
      timestamp,
      source: "activity",
    },
  };
}

export function shouldClearOperationsIrisOptimisticMessage(
  optimisticMessage: OperationsIrisOptimisticMessage | null,
  authoritativeMessageCount: number,
): boolean {
  if (!optimisticMessage) {
    return false;
  }

  return authoritativeMessageCount > optimisticMessage.baselineMessageCount;
}

export function buildOperationsIrisStreamingText(content: string): {
  content: string;
  fallbackSender: "iris";
  fallbackSenderLabel: "Iris";
} | null {
  if (!content) {
    return null;
  }

  return {
    content,
    fallbackSender: "iris",
    fallbackSenderLabel: "Iris",
  };
}

export function mergeOperationsIrisStreamingState(input: {
  currentContent: string;
  currentMessageId: string | null;
  nextMessageId: string | null;
  nextText: string;
}): {
  content: string;
  messageId: string | null;
} {
  return {
    content: mergeStreamingText(
      input.nextMessageId === input.currentMessageId ? input.currentContent : "",
      input.nextText,
    ),
    messageId: input.nextMessageId,
  };
}

export function shouldUseOperationsIrisPollingFallback(input: {
  sessionId: string | null;
  sessionStatus: SessionStatus | null;
  isLiveUnavailable: boolean;
}): boolean {
  return Boolean(input.sessionId) && isSessionStatusActive(input.sessionStatus) && input.isLiveUnavailable;
}