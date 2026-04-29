import { getManagedSessionTitle, getManagedSessionTitleCandidates } from "@/lib/managed-session-titles";
import type { AgentId } from "@/lib/types/mission";

type SessionListClient = {
  session: {
    list?: () => Promise<{
      data?: Array<{ id?: unknown; title?: unknown }>;
      error?: unknown;
    }>;
  };
};

export async function resolveManagedSessionActivationTitle(input: {
  client: SessionListClient;
  missionId: string;
  agentId: AgentId;
  sessionId: string;
}): Promise<string> {
  const canonicalTitle = getManagedSessionTitle(input.missionId, input.agentId);
  const sessionList = input.client.session.list;
  if (typeof sessionList !== "function") {
    return canonicalTitle;
  }

  try {
    const result = await sessionList();
    if (!result.error && Array.isArray(result.data)) {
      const match = result.data.find((session) => session?.id === input.sessionId);
      if (typeof match?.title === "string" && match.title.trim().length > 0) {
        return match.title;
      }
    }
  } catch {
    // Fall back to the canonical title when the runtime session list is unavailable.
  }

  return getManagedSessionTitleCandidates(input.missionId, input.agentId)[0] ?? canonicalTitle;
}