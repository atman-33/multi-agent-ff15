import type { AgentStatus } from "@/routes/_layout.noctis-team/components/character-card";
import type { AppLanguage } from "@/lib/app-language.server";
import {
  createBanterTemplate,
  createLiteralBanterTemplate,
  normalizeBanterAgentId,
  toPartyMemberId,
} from "@/lib/banter/runtime";
import type { BanterTemplate, RecentBanterEntry } from "@/lib/banter/types";

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
  task: string;
  detail?: string;
  progress?: number;
}

export type PartyRuntimeState = Record<string, PartyRuntimeEntry>;

export interface PartyRuntimeUpdate extends PartyRuntimeEntry {
  memberId: string;
  banterTemplate: BanterTemplate | null;
}

interface EventToPartyUpdateOptions {
  language?: AppLanguage;
  recentEntries?: RecentBanterEntry[];
}

const TASK_ASSIGNED_LABEL: Record<string, string> = {
  noctis: "Coordinating…",
  ignis: "Analysing…",
  gladiolus: "Executing…",
  prompto: "Gathering data…",
};

export function eventToPartyUpdate(
  event: AgentEvent,
  options: EventToPartyUpdateOptions = {}
): PartyRuntimeUpdate | null {
  const language = options.language ?? "other";
  const recentEntries = options.recentEntries ?? [];

  switch (event.type) {
    case "session.created": {
      return {
        memberId: "noctis",
        status: "working",
        task: "Coordinating…",
        banterTemplate: createBanterTemplate("noctis", "session-start", { language, recentEntries }),
      };
    }

    case "task.assigned": {
      const { agentId } = event;
      const normalizedAgentId = normalizeBanterAgentId(agentId) ?? agentId;
      return {
        memberId: toPartyMemberId(agentId),
        status: "working",
        task: TASK_ASSIGNED_LABEL[normalizedAgentId] ?? "Working…",
        detail: event.task,
        banterTemplate: createBanterTemplate(agentId, "task-assigned", { language, recentEntries }),
      };
    }

    case "task.progress": {
      const { agentId, stage } = event;
      const normalizedAgentId = normalizeBanterAgentId(agentId) ?? agentId;
      return {
        memberId: toPartyMemberId(agentId),
        status: "working",
        task: TASK_ASSIGNED_LABEL[normalizedAgentId] ?? "Working…",
        banterTemplate: createBanterTemplate(
          agentId,
          stage === "early" ? "task-progress-early" : "task-progress-late",
          { language, recentEntries }
        ),
      };
    }

    case "task.completed": {
      const { agentId } = event;
      return {
        memberId: toPartyMemberId(agentId),
        status: "success",
        task: "Done",
        banterTemplate: createBanterTemplate(agentId, "task-completed", { language, recentEntries }),
      };
    }

    case "task.failed": {
      const { agentId } = event;
      return {
        memberId: toPartyMemberId(agentId),
        status: "blocked",
        task: "Blocked",
        banterTemplate: createBanterTemplate(agentId, "task-failed", { language, recentEntries }),
      };
    }

    case "task.retrying": {
      const { agentId } = event;
      const normalizedAgentId = normalizeBanterAgentId(agentId) ?? agentId;
      return {
        memberId: toPartyMemberId(agentId),
        status: "working",
        task: TASK_ASSIGNED_LABEL[normalizedAgentId] ?? "Retrying…",
        banterTemplate: createBanterTemplate(agentId, "task-retrying", { language, recentEntries }),
      };
    }

    case "session.completed": {
      return {
        memberId: "noctis",
        status: "success",
        task: "Message sent",
        banterTemplate: createLiteralBanterTemplate("noctis", event.message),
      };
    }

    case "runtime.recovered": {
      const { agentId } = event;
      const normalizedAgentId = normalizeBanterAgentId(agentId) ?? agentId;
      return {
        memberId: toPartyMemberId(agentId),
        status: "working",
        task: TASK_ASSIGNED_LABEL[normalizedAgentId] ?? "Retrying…",
        banterTemplate: createBanterTemplate(agentId, "runtime-recovered", { language, recentEntries }),
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
      task: update.task,
      detail: update.detail,
      progress: update.progress,
    },
  };
}
