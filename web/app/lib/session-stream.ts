import type { MessageInfo, MessagePart } from "@/lib/opencode-session-types";

type RawEvent = {
  type?: unknown;
  properties?: {
    sessionID?: unknown;
    part?: {
      type?: unknown;
      text?: unknown;
      tool?: unknown;
      state?: {
        status?: unknown;
        input?: unknown;
        output?: unknown;
        error?: unknown;
      };
      messageID?: unknown;
      sessionID?: unknown;
    };
    status?: {
      type?: unknown;
    };
  };
};

export interface SessionTextPartEvent {
  messageId: string | null;
  sessionId: string | null;
  text: string;
}

export interface SessionLiveDraft {
  messageId: string | null;
  parts: MessagePart[];
  sessionId: string | null;
}

export type SessionLiveEvent =
  | {
      kind: "part";
      messageId: string | null;
      sessionId: string | null;
      part: MessagePart;
    }
  | {
      kind: "status";
      sessionId: string | null;
      status: string | null;
    }
  | {
      kind: "idle";
      sessionId: string | null;
    };

function sanitizePartState(
  value:
    | {
        status?: unknown;
        input?: unknown;
        output?: unknown;
        error?: unknown;
      }
    | undefined,
): MessagePart["state"] | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const nextState: MessagePart["state"] = {};
  const state = value;

  if (typeof state.status === "string") {
    nextState.status = state.status;
  }

  if (state.input && typeof state.input === "object" && !Array.isArray(state.input)) {
    nextState.input = state.input as Record<string, unknown>;
  }

  if (typeof state.output === "string") {
    nextState.output = state.output;
  }

  if (typeof state.error === "string") {
    nextState.error = state.error;
  }

  return Object.keys(nextState).length > 0 ? nextState : undefined;
}

export function parseSessionLiveEvent(payload: unknown): SessionLiveEvent | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const event = payload as RawEvent;
      if (event.type === "session.status") {
        return {
          kind: "status",
          sessionId: typeof event.properties?.sessionID === "string" ? event.properties.sessionID : null,
          status: typeof event.properties?.status?.type === "string" ? event.properties.status.type : null,
        };
      }

      if (event.type === "session.idle") {
        return {
          kind: "idle",
          sessionId: typeof event.properties?.sessionID === "string" ? event.properties.sessionID : null,
        };
      }

      if (event.type !== "message.part.updated" && event.type !== "message.part.created") {
        return null;
  }

  const part = event.properties?.part;
  if (!part || typeof part.type !== "string") {
    return null;
  }

  const messageId = typeof part.messageID === "string" ? part.messageID : null;
  const sessionId =
    typeof part.sessionID === "string"
      ? part.sessionID
      : typeof event.properties?.sessionID === "string"
        ? event.properties.sessionID
        : null;

  const nextPart: MessagePart = {
    type: part.type,
  };

  if (typeof part.text === "string") {
    nextPart.text = part.text;
  }

  if (typeof part.tool === "string") {
    nextPart.tool = part.tool;
  }

  const nextState = sanitizePartState(part.state);
  if (nextState) {
    nextPart.state = nextState;
  }

  return {
    kind: "part",
    messageId,
    sessionId,
    part: nextPart,
  };
}

export function parseSessionTextPartEvent(payload: unknown): SessionTextPartEvent | null {
  const event = parseSessionLiveEvent(payload);
  if (!event || event.kind !== "part" || event.part.type !== "text" || typeof event.part.text !== "string") {
    return null;
  }

  return {
    messageId: event.messageId,
    sessionId: event.sessionId,
    text: event.part.text,
  };
}

function mergeLiveDraftParts(current: MessagePart[], incoming: MessagePart): MessagePart[] {
  if (incoming.type !== "text" && incoming.type !== "reasoning") {
    return [...current, incoming];
  }

  const index = current.findIndex((part) => part.type === incoming.type);
  if (index === -1) {
    return [...current, incoming];
  }

  const nextParts = [...current];
  const currentPart = nextParts[index];
  nextParts[index] = {
    ...currentPart,
    text: mergeStreamingText(currentPart.text ?? "", incoming.text ?? ""),
  };
  return nextParts;
}

export function mergeSessionLiveDraft(
  current: SessionLiveDraft | null,
  event: Extract<SessionLiveEvent, { kind: "part" }>,
): SessionLiveDraft {
  const currentParts = current && current.messageId === event.messageId ? current.parts : [];

  return {
    messageId: event.messageId,
    parts: mergeLiveDraftParts(currentParts, event.part),
    sessionId: event.sessionId,
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
