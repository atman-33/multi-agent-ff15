import type { AgentStatus } from "@/routes/_layout.noctis-team/components/character-card";
import type { BanterEntry } from "@/routes/_layout.noctis-team/components/banter-log";
import type { PartyMember } from "@/routes/_layout.noctis-team/components/party-status-panel";

export type AgentEvent =
  | { type: "session.created" }
  | { type: "task.assigned"; agentId: string; task: string }
  | { type: "task.completed"; agentId: string; summary?: string }
  | { type: "task.failed"; agentId: string; error?: string }
  | { type: "session.completed"; message: string }
  | { type: "runtime.recovered"; agentId: string }
  | { type: "message.part.updated"; agentId?: string; text?: string };

export interface PartyUpdate {
  memberId: string;
  status: AgentStatus;
  task: string;
  detail?: string;
  banterTemplate: BanterTemplate | null;
}

export interface BanterTemplate {
  speakerId: string;
  speakerName: string;
  speakerAvatar: string;
  message: string;
}

const AGENT_DISPLAY: Record<string, { name: string; avatar: string }> = {
  noctis: { name: "Noctis", avatar: "/images/noctis.png" },
  ignis: { name: "Ignis", avatar: "/images/ignis.png" },
  gladiolus: { name: "Gladio", avatar: "/images/gladiolus.png" },
  prompto: { name: "Prompto", avatar: "/images/prompto.png" },
};

const TASK_ASSIGNED_BANTER: Record<string, string> = {
  ignis: "Running analysis... this may take a moment.",
  gladiolus: "Executing task. Don't get in my way.",
  prompto: "On it! Gathering data as we speak.",
};

const TASK_ASSIGNED_LABEL: Record<string, string> = {
  ignis: "Analysing…",
  gladiolus: "Executing…",
  prompto: "Gathering data…",
};

const TASK_COMPLETED_BANTER: Record<string, string> = {
  ignis: "Analysis complete. Results transmitted to Noctis.",
  gladiolus: "Task done. Clean as a blade.",
  prompto: "Report filed! And I got some sick shots too.",
};

const TASK_FAILED_BANTER: Record<string, string> = {
  ignis: "...Something's off. Running diagnostics.",
  gladiolus: "Hit a wall. Not backing down.",
  prompto: "Ugh, can't get a clear shot. Regrouping.",
};

const RUNTIME_RECOVERED_BANTER: Record<string, string> = {
  ignis: "Recalibrating. Back on it.",
  gladiolus: "Tch. Shaking it off — try again.",
  prompto: "Take two! Let's do this.",
};

function makeBanter(agentId: string, message: string): BanterTemplate | null {
  const display = AGENT_DISPLAY[agentId];
  if (!display) return null;
  return {
    speakerId: agentId,
    speakerName: display.name,
    speakerAvatar: display.avatar,
    message,
  };
}

export function eventToPartyUpdate(event: AgentEvent): PartyUpdate | null {
  switch (event.type) {
    case "session.created": {
      return {
        memberId: "noctis",
        status: "working",
        task: "Coordinating…",
        banterTemplate: makeBanter("noctis", "Alright. Everyone, listen up."),
      };
    }

    case "task.assigned": {
      const { agentId } = event;
      const task = TASK_ASSIGNED_LABEL[agentId] ?? "Working…";
      const message = TASK_ASSIGNED_BANTER[agentId];
      return {
        memberId: agentId,
        status: "working",
        task,
        detail: event.task,
        banterTemplate: message ? makeBanter(agentId, message) : null,
      };
    }

    case "task.completed": {
      const { agentId } = event;
      const message = TASK_COMPLETED_BANTER[agentId];
      return {
        memberId: agentId,
        status: "success",
        task: "Done",
        banterTemplate: message ? makeBanter(agentId, message) : null,
      };
    }

    case "task.failed": {
      const { agentId } = event;
      const message = TASK_FAILED_BANTER[agentId];
      return {
        memberId: agentId,
        status: "blocked",
        task: "Blocked",
        banterTemplate: message ? makeBanter(agentId, message) : null,
      };
    }

    case "session.completed": {
      return {
        memberId: "noctis",
        status: "success",
        task: "Message sent",
        banterTemplate: makeBanter("noctis", event.message),
      };
    }

    case "runtime.recovered": {
      const { agentId } = event;
      const message = RUNTIME_RECOVERED_BANTER[agentId];
      return {
        memberId: agentId,
        status: "working",
        task: TASK_ASSIGNED_LABEL[agentId] ?? "Retrying…",
        banterTemplate: message ? makeBanter(agentId, message) : null,
      };
    }

    case "message.part.updated":
      return null;
  }
}

export function resetToIdle(members: PartyMember[]): PartyMember[] {
  return members.map((m) => ({
    ...m,
    status: "idle" as AgentStatus,
    task: m.id === "noctis" ? "On the road" : "Awaiting orders",
    detail: undefined,
  }));
}

export function applyPartyUpdate(
  members: PartyMember[],
  update: PartyUpdate
): PartyMember[] {
  return members.map((m) => {
    if (m.id !== update.memberId) return m;
    return { ...m, status: update.status, task: update.task, detail: update.detail };
  });
}
