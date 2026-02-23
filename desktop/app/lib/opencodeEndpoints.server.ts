import fs from 'node:fs';
import path from 'node:path';
import { getProjectRoot } from './getProjectRoot.server';

export interface OpencodeEndpoint {
  hostname: string;
  port: number;
  baseUrl: string;
  portSource: 'fixed' | 'auto_range';
}

export interface OpencodeManifest {
  generatedAt: string;
  agents: Record<string, OpencodeEndpoint>;
}

export function getOpencodeEndpoints(): OpencodeManifest | null {
  try {
    const root = getProjectRoot();
    const manifestPath = path.join(root, 'runtime/opencode-endpoints.json');
    if (!fs.existsSync(manifestPath)) {
      return null;
    }
    const data = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(data) as OpencodeManifest;
  } catch (err) {
    console.error('Failed to read endpoints manifest:', err);
    return null;
  }
}

export function getAgentEndpoint(agentName: string): OpencodeEndpoint | null {
  const manifest = getOpencodeEndpoints();
  if (!manifest || !manifest.agents || !manifest.agents[agentName]) {
    return null;
  }
  return manifest.agents[agentName];
}
