import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2";
import { getAgentEndpoint } from "./opencode-endpoints.server";

const CLIENT_CACHE = new Map<string, OpencodeClient>();

export function getClientForAgent(agentName: string): OpencodeClient | null {
  const endpoint = getAgentEndpoint(agentName);
  if (!endpoint) {
    CLIENT_CACHE.delete(agentName);
    return null;
  }

  const cached = CLIENT_CACHE.get(agentName);
  if (cached) {
    return cached;
  }

  const client = createOpencodeClient({
    baseUrl: endpoint.baseUrl,
  });
  CLIENT_CACHE.set(agentName, client);
  return client;
}
