import { appendMissionActivity } from "./mission-store";
import {
  enqueuePrimaryAgentOutboxItem,
  type PrimaryAgentOutboxItem,
} from "./mission-primary-agent-outbox.server";
import type { TextPromptPart } from "./prompt-parts";
import type { AgentId, ModelSelection } from "./types/mission";

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
    },
  });

  appendMissionActivity(input.missionId, {
    id: `activity_${item.id}`,
    actor: "system",
    speaker: "system",
    kind: "system_event",
    body: "Queued primary-agent tmux delivery.",
    createdAt: queuedAt,
    source: {
      type: "system",
      sessionId: input.sessionId,
    },
  });

  return item;
}