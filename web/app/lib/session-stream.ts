import type { MessageInfo, MessagePart } from "@/routes/_layout.opencode.session.$id/types";

type RawEvent = {
  type?: unknown;
  properties?: {
    sessionID?: unknown;
    part?: {
      type?: unknown;
      text?: unknown;
      messageID?: unknown;
      sessionID?: unknown;
    };
  };
};

export interface SessionTextPartEvent {
  messageId: string | null;
  sessionId: string | null;
  text: string;
}

export function parseSessionTextPartEvent(payload: unknown): SessionTextPartEvent | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const event = payload as RawEvent;
  if (event.type !== "message.part.updated" && event.type !== "message.part.created") {
    return null;
  }

  const part = event.properties?.part;
  if (!part || part.type !== "text" || typeof part.text !== "string") {
    return null;
  }

  const messageId = typeof part.messageID === "string" ? part.messageID : null;
  const sessionId =
    typeof part.sessionID === "string"
      ? part.sessionID
      : typeof event.properties?.sessionID === "string"
        ? event.properties.sessionID
        : null;

  return {
    messageId,
    sessionId,
    text: part.text,
  };
}

export function mergeStreamingText(previous: string, incoming: string): string {
  if (!previous) {
    return incoming;
  }

  if (!incoming) {
    return previous;
  }

  if (incoming.startsWith(previous)) {
    return incoming;
  }

  if (previous.startsWith(incoming)) {
    return previous;
  }

  return `${previous}${incoming}`;
}

export function mergeMessagePartsText(parts: MessagePart[], incoming: string): MessagePart[] {
  const nextParts = [...parts];
  const textIndex = nextParts.findIndex((part) => part.type === "text");

  if (textIndex === -1) {
    return [...nextParts, { type: "text", text: incoming }];
  }

  const currentPart = nextParts[textIndex];
  nextParts[textIndex] = {
    ...currentPart,
    text: mergeStreamingText(currentPart.text ?? "", incoming),
  };

  return nextParts;
}

export function mergeMessageInfoText(message: MessageInfo, incoming: string): MessageInfo {
  return {
    ...message,
    parts: mergeMessagePartsText(message.parts, incoming),
  };
}
