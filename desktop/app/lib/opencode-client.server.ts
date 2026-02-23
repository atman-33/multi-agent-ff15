import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2";
import { getAgentEndpoint } from "./opencode-endpoints.server";

export function getClientForAgent(agentName: string): OpencodeClient | null {
  const endpoint = getAgentEndpoint(agentName);
  if (!endpoint) {
    return null;
  }

  return createOpencodeClient({
    baseUrl: endpoint.baseUrl,
  });
}
