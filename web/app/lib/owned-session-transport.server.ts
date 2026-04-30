import {
  cancelTmuxDispatchItemsForSession,
  enqueuePrimaryAgentOutboxItem,
  listTmuxDispatchItems,
  type PrimaryAgentOutboxItem,
  type TmuxDispatchItem,
} from "./mission-primary-agent-outbox.server";
import type { TextPromptPart } from "./prompt-parts";
import type { OwnedSessionEntry } from "./owned-session-registry.server";
import type { ModelSelection } from "./types/mission";

const OWNED_SESSION_TRANSPORT_MISSION_PREFIX = "owned-session";

export function getOwnedSessionTransportMissionId(sessionId: string): string {
  return `${OWNED_SESSION_TRANSPORT_MISSION_PREFIX}-${sessionId}`;
}

export function queueOwnedSessionTmuxDispatch(input: {
  ownerAgent: OwnedSessionEntry["ownerAgent"];
  sessionId: string;
  sessionTitle: string;
  parts: TextPromptPart[];
  model?: Pick<ModelSelection, "providerID" | "modelID">;
  queuedAt?: string;
  system?: string;
  variant?: string;
}): PrimaryAgentOutboxItem {
  return enqueuePrimaryAgentOutboxItem({
    missionId: getOwnedSessionTransportMissionId(input.sessionId),
    ...(input.queuedAt ? { createdAt: input.queuedAt } : {}),
    payload: {
      agent: input.ownerAgent,
      sessionId: input.sessionId,
      sessionTitle: input.sessionTitle,
      parts: input.parts,
      ...(input.system ? { system: input.system } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.variant ? { variant: input.variant } : {}),
    },
  });
}

export function listOwnedSessionTmuxDispatchItems(sessionId: string): TmuxDispatchItem[] {
  return listTmuxDispatchItems(getOwnedSessionTransportMissionId(sessionId));
}

export function cancelOwnedSessionTmuxDispatchItems(input: {
  sessionId: string;
  cancelledAt?: string;
  cancelledBy: string;
  reason: string;
}): TmuxDispatchItem[] {
  return cancelTmuxDispatchItemsForSession({
    missionId: getOwnedSessionTransportMissionId(input.sessionId),
    sessionId: input.sessionId,
    ...(input.cancelledAt ? { cancelledAt: input.cancelledAt } : {}),
    cancelledBy: input.cancelledBy,
    reason: input.reason,
  });
}