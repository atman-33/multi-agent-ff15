import {
  hasTrackedSelectionDifference,
  type SessionSelection,
  type SessionSelectionAdjustment,
} from "@/lib/session-selection-adjustment";
import type { ModelSelection } from "@/lib/types/mission";
import type { MessageErrorInfo, MessageInfo, MessagePart } from "@/lib/opencode-session-types";

export type RawSessionMessage = {
  info: {
    agent?: string;
    error?: unknown;
    id: string;
    model?: {
      modelID: string;
      providerID: string;
    };
    modelID?: string;
    parentID?: string;
    providerID?: string;
    role: "user" | "assistant";
    time: {
      completed?: number;
      created: number;
    };
    variant?: string;
  };
  parts: unknown[];
};

const ADJUSTMENT_EXPLANATION =
  "Runtime adjusted the requested selection before recording this reply.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toModelSelection(info: RawSessionMessage["info"]): ModelSelection | null {
  if (info.role === "user") {
    if (!info.model?.providerID || !info.model?.modelID) {
      return null;
    }

    return {
      providerID: info.model.providerID,
      modelID: info.model.modelID,
      ...(info.variant ? { variant: info.variant } : {}),
    };
  }

  if (!info.providerID || !info.modelID) {
    return null;
  }

  return {
    providerID: info.providerID,
    modelID: info.modelID,
    ...(info.variant ? { variant: info.variant } : {}),
  };
}

function buildAssistantSelectionAdjustment(
  info: RawSessionMessage["info"],
  anchors: Record<string, { requested: SessionSelection }>,
): SessionSelectionAdjustment | null {
  if (info.role !== "assistant" || !info.parentID) {
    return null;
  }

  const anchor = anchors[info.parentID];
  if (!anchor) {
    return null;
  }

  const actual: SessionSelection = {
    agent: info.agent ?? null,
    model: toModelSelection(info),
  };

  if (!hasTrackedSelectionDifference(anchor.requested, actual)) {
    return null;
  }

  return {
    actual,
    explanation: ADJUSTMENT_EXPLANATION,
    requestMessageId: info.parentID,
    requested: anchor.requested,
  };
}

function sanitizeMessagePartState(value: unknown): MessagePart["state"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const nextState: MessagePart["state"] = {};

  if (typeof value.status === "string") {
    nextState.status = value.status;
  }

  if (isRecord(value.input)) {
    nextState.input = value.input;
  }

  if (typeof value.output === "string") {
    nextState.output = value.output;
  }

  if (typeof value.error === "string") {
    nextState.error = value.error;
  }

  return Object.keys(nextState).length > 0 ? nextState : undefined;
}

function sanitizeMessagePart(part: unknown): MessagePart | null {
  if (!isRecord(part) || typeof part.type !== "string") {
    return null;
  }

  const nextPart: MessagePart = {
    type: part.type,
  };

  if (typeof part.text === "string") {
    nextPart.text = part.text;
  }

  if (typeof part.tool === "string") {
    nextPart.tool = part.tool;
  }

  const nextState = sanitizeMessagePartState(part.state);
  if (nextState) {
    nextPart.state = nextState;
  }

  return nextPart;
}

function sanitizeMessageError(value: unknown): MessageErrorInfo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const name = typeof value.name === "string" ? value.name : undefined;
  const data = isRecord(value.data) ? value.data : undefined;
  const message =
    typeof value.message === "string"
      ? value.message
      : typeof data?.message === "string"
        ? data.message
        : undefined;

  if (!name && !message) {
    return undefined;
  }

  return {
    ...(name ? { name } : {}),
    ...(message ? { message } : {}),
  };
}

function sanitizeMessage(
  message: RawSessionMessage,
  anchors: Record<string, { requested: SessionSelection }>,
): MessageInfo {
  const model = toModelSelection(message.info);
  const selectionAdjustment = buildAssistantSelectionAdjustment(message.info, anchors);

  return {
    info: {
      id: message.info.id,
      role: message.info.role,
      ...(typeof message.info.agent === "string" ? { agent: message.info.agent } : {}),
      ...(model ? { model } : {}),
      ...(typeof message.info.parentID === "string" ? { parentID: message.info.parentID } : {}),
      ...(sanitizeMessageError(message.info.error)
        ? { error: sanitizeMessageError(message.info.error) }
        : {}),
      ...(selectionAdjustment ? { selectionAdjustment } : {}),
      time: message.info.time,
    },
    parts: message.parts
      .map((part) => sanitizeMessagePart(part))
      .filter((part): part is MessagePart => part !== null),
  };
}

export function sanitizeSessionMessages(
  messages: RawSessionMessage[],
  anchors: Record<string, { requested: SessionSelection }>,
): MessageInfo[] {
  return messages.map((message) => sanitizeMessage(message, anchors));
}