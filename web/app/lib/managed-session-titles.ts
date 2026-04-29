import type { AgentId } from "@/lib/types/mission";

function isPrimaryAgentId(agentId: AgentId): agentId is "noctis" | "lunafreya" {
  return agentId === "noctis" || agentId === "lunafreya";
}

export function getManagedSessionTitle(missionId: string, agentId: AgentId): string {
  return `mission:${missionId}:${agentId}`;
}

export function getManagedSessionTitleCandidates(missionId: string, agentId: AgentId): string[] {
  const canonicalTitle = getManagedSessionTitle(missionId, agentId);
  if (!isPrimaryAgentId(agentId)) {
    return [canonicalTitle];
  }

  return [canonicalTitle, `mission:${missionId}`];
}