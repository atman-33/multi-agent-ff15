import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";
import { getAgentEndpoint } from "./opencodeEndpoints.server";

export function getClientForAgent(agentName: string): OpencodeClient | null {
  const endpoint = getAgentEndpoint(agentName);
  if (!endpoint) {
    return null;
  }

  return createOpencodeClient({
    baseUrl: endpoint.baseUrl,
  });
}
