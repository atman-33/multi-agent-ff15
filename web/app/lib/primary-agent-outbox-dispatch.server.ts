import { appendMissionActivity } from "./mission-store";
import {
  enqueuePrimaryAgentOutboxItem,
  type PrimaryAgentOutboxItem,
  type TmuxDispatchRecordLinks,
} from "./mission-primary-agent-outbox.server";
import type { TextPromptPart } from "./prompt-parts";
import type { AgentId, ModelSelection } from "./types/mission";

export function queueTmuxAgentDispatch(input: {
  agent: AgentId;
  activityBody: string;
  missionId: string;
  model?: Pick<ModelSelection, "providerID" | "modelID">;
  parts: TextPromptPart[];
  queuedAt?: string;
  recordLinks?: TmuxDispatchRecordLinks;
  sessionId: string;
  sessionTitle?: string;
  system?: string;
  variant?: string;
}): PrimaryAgentOutboxItem {
  const queuedAt = input.queuedAt ?? new Date().toISOString();
  const item = enqueuePrimaryAgentOutboxItem({
    missionId: input.missionId,
    createdAt: queuedAt,
    payload: {
      agent: input.agent,
      sessionId: input.sessionId,
      ...(input.sessionTitle ? { sessionTitle: input.sessionTitle } : {}),
      parts: input.parts,
      ...(input.system ? { system: input.system } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.variant ? { variant: input.variant } : {}),
      ...(input.recordLinks ? { recordLinks: input.recordLinks } : {}),
    },
  });

  appendMissionActivity(input.missionId, {
    id: `activity_${item.id}`,
    actor: "system",
    speaker: "system",
    kind: "system_event",
    body: input.activityBody,
    createdAt: queuedAt,
    source: {
      type: "system",
      sessionId: input.sessionId,
    },
  });

  return item;
}

export function queuePrimaryAgentTmuxDispatch(input: {
  agent: AgentId;
  missionId: string;
  model?: Pick<ModelSelection, "providerID" | "modelID">;
  parts: TextPromptPart[];
  queuedAt?: string;
  sessionId: string;
  sessionTitle?: string;
  system?: string;
  variant?: string;
}): PrimaryAgentOutboxItem {
  return queueTmuxAgentDispatch({
    ...input,
    activityBody: "Queued primary-agent tmux delivery.",
  });
}