import { getOpencodeClient } from "@/lib/opencode-client";
import { readEffectiveSessionExecutionContext } from "@/lib/managed-session.server";
import { listSessionRequestAnchors } from "@/lib/session-request-anchors.server";
import {
  hasTrackedSelectionDifference,
  type SessionSelection,
  type SessionSelectionAdjustment,
} from "@/lib/session-selection-adjustment";
import type { ModelSelection } from "@/lib/types/mission";
import type { MessageInfo, MessagePart } from "@/routes/_layout.opencode.session.$id/types";
import type { Route } from "./+types/api.session.$id";

type RawSessionMessage = {
  info: {
    agent?: string;
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
  parts: MessagePart[];
};

const ADJUSTMENT_EXPLANATION =
  "Runtime adjusted the requested selection before recording this reply.";

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

function toMessageInfo(
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
      ...(selectionAdjustment ? { selectionAdjustment } : {}),
      time: message.info.time,
    },
    parts: message.parts,
  };
}

export const loader = async ({ params }: Route.LoaderArgs) => {
  const sessionId = params.id;
  if (!sessionId) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  const executionContext = readEffectiveSessionExecutionContext(sessionId);

  try {
    const client = getOpencodeClient();
    const result = await client.session.messages({ sessionID: sessionId });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    const anchors = listSessionRequestAnchors(sessionId);
    const messages = ((result.data ?? []) as RawSessionMessage[]).map((message) =>
      toMessageInfo(message, anchors),
    );

    return Response.json({ executionContext, messages });
  } catch {
    return Response.json({ executionContext, messages: [] }, { status: 503 });
  }
};
