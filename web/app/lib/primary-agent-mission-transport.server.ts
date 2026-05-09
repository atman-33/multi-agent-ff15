import { resolveManagedSessionActivationTitle } from "./managed-session-activation.server";
import { queuePrimaryAgentTmuxDispatch } from "./primary-agent-outbox-dispatch.server";
import type { TextPromptPart } from "./prompt-parts";
import {
  activateTmuxMissionWriteFocus,
  getTmuxMissionWriteConflict,
} from "./tmux-mission-activation.server";
import {
  getMissionTransportStatus,
  type ConfiguredMissionTransportStatus,
} from "./tmux-transport-bootstrap.server";
import type { getOpencodeClient } from "./opencode-client";
import type { MissionPrimaryAgentId, MissionTransportMode, ModelSelection } from "./types/mission";

export class MissionTransportNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissionTransportNotReadyError";
  }
}

export class TmuxMissionWriteConflictError extends Error {
  readonly activeMissionId: string;

  constructor(activeMissionId: string) {
    super(`Tmux write focus is still held by mission ${activeMissionId}.`);
    this.name = "TmuxMissionWriteConflictError";
    this.activeMissionId = activeMissionId;
  }
}

export async function requireReadyMissionTransport(input: {
  appRoot: string;
  transportMode?: MissionTransportMode | null;
}): Promise<ConfiguredMissionTransportStatus> {
  const transportStatus = await getMissionTransportStatus(input.appRoot, input.transportMode);
  if (!transportStatus.isReady) {
    throw new MissionTransportNotReadyError(
      transportStatus.error ?? "Tmux transport bootstrap is not ready.",
    );
  }

  return transportStatus;
}

export async function claimPrimaryAgentTmuxMissionWriteFocus(input: {
  appRoot: string;
  client: ReturnType<typeof getOpencodeClient>;
  missionId: string;
  updatedAt?: string;
}): Promise<void> {
  const conflict = await getTmuxMissionWriteConflict({
    appRoot: input.appRoot,
    missionId: input.missionId,
    client: input.client,
  });
  if (conflict) {
    throw new TmuxMissionWriteConflictError(conflict.activeMissionId);
  }

  activateTmuxMissionWriteFocus({
    appRoot: input.appRoot,
    missionId: input.missionId,
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  });
}

export async function queueResolvedPrimaryAgentTmuxMissionWrite(input: {
  agentId: MissionPrimaryAgentId;
  appRoot: string;
  client: ReturnType<typeof getOpencodeClient>;
  missionId: string;
  model?: Pick<ModelSelection, "providerID" | "modelID">;
  parts: TextPromptPart[];
  sessionId: string;
  system?: string;
  variant?: string;
}): Promise<void> {
  queuePrimaryAgentTmuxDispatch({
    missionId: input.missionId,
    sessionId: input.sessionId,
    sessionTitle: await resolveManagedSessionActivationTitle({
      client: input.client,
      missionId: input.missionId,
      agentId: input.agentId,
      sessionId: input.sessionId,
    }),
    agent: input.agentId,
    parts: input.parts,
    ...(input.system ? { system: input.system } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
  });
}