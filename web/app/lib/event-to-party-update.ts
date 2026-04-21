import {
  normalizeBanterAgentId,
  toPartyMemberId,
} from "@/lib/banter/runtime";
import type { BanterCue } from "@/lib/banter/types";
import type { AgentStatus } from "@/lib/noctis-team-ui-types";

export type AgentEvent =
  | { type: "session.created" }
  | { type: "task.assigned"; agentId: string; task: string }
  | { type: "task.progress"; agentId: string; stage: "early" | "late" }
  | { type: "task.completed"; agentId: string; summary?: string }
  | { type: "task.failed"; agentId: string; error?: string }
  | { type: "task.retrying"; agentId: string }
  | { type: "session.completed"; message: string }
  | { type: "runtime.recovered"; agentId: string }
  | { type: "message.part.updated"; agentId?: string; text?: string };

export interface PartyRuntimeEntry {
  status: AgentStatus;
  detail?: string;
  progress?: number;
}

export type PartyRuntimeState = Record<string, PartyRuntimeEntry>;

export interface PartyRuntimeUpdate extends PartyRuntimeEntry {
  memberId: string;
  speakerAgent?: string;
  cue?: BanterCue;
}

const _TASK_ASSIGNED_LABEL: Record<string, string> = {
  noctis: "Coordinating…",
  ignis: "Analysing…",
  gladiolus: "Executing…",
  prompto: "Gathering data…",
};

export function eventToPartyUpdate(
  event: AgentEvent,
): PartyRuntimeUpdate | null {
  switch (event.type) {
    case "session.created": {
      return {
        memberId: "noctis",
        status: "working",
        speakerAgent: "noctis",
        cue: "session-start",
      };
    }

    case "task.assigned": {
      const { agentId } = event;
      const normalizedAgentId = normalizeBanterAgentId(agentId) ?? agentId;
      return {
        memberId: toPartyMemberId(agentId),
        status: "working",
        detail: event.task,
        speakerAgent: normalizedAgentId,
        cue: "task-assigned",
      };
    }

    case "task.progress": {
      const { agentId, stage } = event;
      const normalizedAgentId = normalizeBanterAgentId(agentId) ?? agentId;
      return {
        memberId: toPartyMemberId(agentId),
        status: "working",
        speakerAgent: normalizedAgentId,
        cue: stage === "early" ? "task-progress-early" : "task-progress-late",
      };
    }

    case "task.completed": {
      const { agentId } = event;
      const normalizedAgentId = normalizeBanterAgentId(agentId) ?? agentId;
      return {
        memberId: toPartyMemberId(agentId),
        status: "success",
        speakerAgent: normalizedAgentId,
        cue: "task-completed",
      };
    }

    case "task.failed": {
      const { agentId } = event;
      const normalizedAgentId = normalizeBanterAgentId(agentId) ?? agentId;
      return {
        memberId: toPartyMemberId(agentId),
        status: "blocked",
        speakerAgent: normalizedAgentId,
        cue: "task-failed",
      };
    }

    case "task.retrying": {
      const { agentId } = event;
      const normalizedAgentId = normalizeBanterAgentId(agentId) ?? agentId;
      return {
        memberId: toPartyMemberId(agentId),
        status: "working",
        speakerAgent: normalizedAgentId,
        cue: "task-retrying",
      };
    }

    case "session.completed": {
      return {
        memberId: "noctis",
        status: "success",
      };
    }

    case "runtime.recovered": {
      const { agentId } = event;
      const normalizedAgentId = normalizeBanterAgentId(agentId) ?? agentId;
      return {
        memberId: toPartyMemberId(agentId),
        status: "working",
        speakerAgent: normalizedAgentId,
        cue: "runtime-recovered",
      };
    }

    case "message.part.updated":
      return null;
  }
}

export function applyPartyRuntimeUpdate(
  current: PartyRuntimeState,
  update: PartyRuntimeUpdate
): PartyRuntimeState {
  const existing = current[update.memberId];
  if (!existing) {
    return current;
  }

  return {
    ...current,
    [update.memberId]: {
      ...existing,
      status: update.status,
      detail: update.detail,
      progress: update.progress,
    },
  };
}
