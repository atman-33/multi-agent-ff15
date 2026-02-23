import fs from "node:fs";
import path from "node:path";
import { getProjectRoot } from "./get-project-root.server";

export interface OpencodeEndpoint {
  baseUrl: string;
  hostname: string;
  port: number;
  portSource: "fixed" | "auto_range";
}

export interface OpencodeManifest {
  agents: Record<string, OpencodeEndpoint>;
  generatedAt: string;
}

export function getOpencodeEndpoints(): OpencodeManifest | null {
  try {
    const root = getProjectRoot();
    const manifestPath = path.join(root, "runtime/opencode-endpoints.json");
    if (!fs.existsSync(manifestPath)) {
      return null;
    }
    const data = fs.readFileSync(manifestPath, "utf-8");
    return JSON.parse(data) as OpencodeManifest;
  } catch (err) {
    console.error("Failed to read endpoints manifest:", err);
    return null;
  }
}

export function getAgentEndpoint(agentName: string): OpencodeEndpoint | null {
  const manifest = getOpencodeEndpoints();
  if (!manifest?.agents?.[agentName]) {
    return null;
  }
  return manifest.agents[agentName];
}
