import { ALL_MODEL_SWITCH_AGENTS } from "@/lib/agents";
import { getClientForAgent } from "@/lib/opencode-client.server";

/**
 * GET /api/agent-statuses
 * Returns the session status (busy/idle) for all agents.
 */
export async function loader() {
  const statuses: Record<string, string> = {};

  await Promise.all(
    ALL_MODEL_SWITCH_AGENTS.map(async (agent) => {
      try {
        const client = getClientForAgent(agent);
        if (!client) {
          statuses[agent] = "unknown";
          return;
        }

        const { data } = await client.session.status();
        if (data && Object.keys(data).length > 0) {
          const statusList = Object.values(data) as any[];
          // Priority: Return 'busy' if any session is busy, otherwise the first one's type
          const activeStatus =
            statusList.find((s) => s.type === "busy") || statusList[0];
          statuses[agent] = activeStatus?.type || "idle";
        } else {
          statuses[agent] = "idle";
        }
      } catch (_e) {
        // Silently fail for individual agents to avoid breaking the whole response
        statuses[agent] = "offline";
      }
    })
  );

  return Response.json(statuses);
}
