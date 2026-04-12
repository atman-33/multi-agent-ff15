import type { AgentId, MissionPrimaryAgentId, WorkerAgentId } from "@/lib/types/mission";

export function isWorkerAgentId(agentId: AgentId): agentId is WorkerAgentId {
  return agentId === "ignis" || agentId === "gladiolus" || agentId === "prompto";
}

export function isMissionPrimaryAgentId(agentId: AgentId): agentId is MissionPrimaryAgentId {
  return agentId === "noctis" || agentId === "lunafreya";
}

export function getAgentLabel(agentId: AgentId): string {
  switch (agentId) {
    case "noctis":
      return "Noctis";
    case "lunafreya":
      return "Lunafreya";
    case "ignis":
      return "Ignis";
    case "gladiolus":
      return "Gladiolus";
    case "prompto":
      return "Prompto";
  }
}