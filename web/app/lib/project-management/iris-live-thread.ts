import type { SessionPresentationMessage } from "@/lib/session-message-presentation";
import { mergeMessagePartsText, mergeStreamingText } from "@/lib/session-stream";
import { isSessionStatusActive, type SessionStatus } from "@/lib/session-status";

export function buildProjectIrisLiveDraft(input: {
  messageId: string | null;
  parts: SessionPresentationMessage["parts"] | undefined;
  sessionId: string | null;
} | null): {
  fallbackSender: "iris";
  fallbackSenderLabel: "Iris";
  messageId: string | null;
  parts: NonNullable<SessionPresentationMessage["parts"]>;
} | null {
  if (!input?.parts || input.parts.length === 0) {
    return null;
  }

  return {
    fallbackSender: "iris",
    fallbackSenderLabel: "Iris",
    messageId: input.messageId,
    parts: input.parts,
  };
}

export function buildProjectIrisStreamingText(content: string): {
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

export function mergeProjectIrisStreamingMessage(
  message: SessionPresentationMessage,
  incoming: string,
): SessionPresentationMessage {
  return {
    ...message,
    content: mergeStreamingText(message.content, incoming),
    detailContent: mergeStreamingText(message.detailContent ?? message.content, incoming),
    rawText: mergeStreamingText(message.rawText ?? message.content, incoming),
    parts: mergeMessagePartsText(message.parts ?? [], incoming),
  };
}

export function shouldUseProjectIrisPollingFallback(input: {
  isLiveUnavailable: boolean;
  sessionId: string | null;
  sessionStatus: SessionStatus | null;
}): boolean {
  return Boolean(input.sessionId) && isSessionStatusActive(input.sessionStatus) && input.isLiveUnavailable;
}