import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { readAppConfig, type AppConfig } from "@/lib/app-config.server";
import type { MissionTransportMode } from "@/lib/types/mission";

export const TMUX_TRANSPORT_ENDPOINT_MANIFEST_FILE = "opencode-endpoints.json";
export const TMUX_TRANSPORT_DISPATCHER_STATE_FILE = "tmux-transport-dispatcher.json";

type TmuxTransportEndpointManifest = {
  agents: Array<{
    agentId: string;
    port: number;
    url: string;
  }>;
  startedAt: string;
  version: 1;
};

type TmuxTransportDispatcherState = {
  mode: "tmux-resident";
  owner: "standby";
  pid: number;
  startedAt: string;
  version: 1;
};

type RuntimeRecordState = "invalid" | "missing" | "valid";

export type TmuxTransportBootstrapStatus = {
  agentCount: number;
  dispatcherPid: number | null;
  dispatcherState: RuntimeRecordState;
  dispatcherStatePath: string;
  endpointManifestPath: string;
  endpointManifestState: RuntimeRecordState;
  error: string | null;
  isReady: boolean;
  lastStartedAt: string | null;
};

export type ConfiguredMissionTransportStatus = {
  bootstrapStatus: TmuxTransportBootstrapStatus | null;
  error: string | null;
  isReady: boolean;
  transportMode: AppConfig["transportMode"];
};

function getEndpointManifestPath(root: string): string {
  return join(root, "runtime", TMUX_TRANSPORT_ENDPOINT_MANIFEST_FILE);
}

function getDispatcherStatePath(root: string): string {
  return join(root, "runtime", TMUX_TRANSPORT_DISPATCHER_STATE_FILE);
}

function parseEndpointManifest(value: unknown): TmuxTransportEndpointManifest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.version !== 1 || typeof record.startedAt !== "string" || !Array.isArray(record.agents)) {
    return null;
  }

  const agents = record.agents
    .map((agent) => {
      if (!agent || typeof agent !== "object") {
        return null;
      }

      const entry = agent as Record<string, unknown>;
      if (
        typeof entry.agentId !== "string" ||
        typeof entry.port !== "number" ||
        typeof entry.url !== "string"
      ) {
        return null;
      }

      return {
        agentId: entry.agentId,
        port: entry.port,
        url: entry.url,
      };
    })
    .filter((agent): agent is NonNullable<typeof agent> => agent !== null);

  if (agents.length !== record.agents.length) {
    return null;
  }

  return {
    agents,
    startedAt: record.startedAt,
    version: 1,
  };
}

function parseDispatcherState(value: unknown): TmuxTransportDispatcherState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    record.owner !== "standby" ||
    record.mode !== "tmux-resident" ||
    typeof record.pid !== "number" ||
    typeof record.startedAt !== "string"
  ) {
    return null;
  }

  return {
    mode: "tmux-resident",
    owner: "standby",
    pid: record.pid,
    startedAt: record.startedAt,
    version: 1,
  };
}

function readJsonRecord<T>(
  path: string,
  parse: (value: unknown) => T | null,
): { record: T | null; state: RuntimeRecordState } {
  if (!existsSync(path)) {
    return {
      record: null,
      state: "missing",
    };
  }

  try {
    const record = parse(JSON.parse(readFileSync(path, "utf-8")));
    return {
      record,
      state: record ? "valid" : "invalid",
    };
  } catch {
    return {
      record: null,
      state: "invalid",
    };
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function getTmuxTransportBootstrapStatus(
  root: string,
): Promise<TmuxTransportBootstrapStatus> {
  const endpointManifestPath = getEndpointManifestPath(root);
  const dispatcherStatePath = getDispatcherStatePath(root);
  const endpointManifest = readJsonRecord(endpointManifestPath, parseEndpointManifest);

  if (endpointManifest.state !== "valid" || !endpointManifest.record) {
    return {
      agentCount: 0,
      dispatcherPid: null,
      dispatcherState: "missing",
      dispatcherStatePath,
      endpointManifestPath,
      endpointManifestState: endpointManifest.state,
      error:
        endpointManifest.state === "invalid"
          ? `Invalid tmux transport endpoint manifest at ${endpointManifestPath}`
          : `Missing tmux transport endpoint manifest at ${endpointManifestPath}`,
      isReady: false,
      lastStartedAt: null,
    };
  }

  const dispatcherState = readJsonRecord(dispatcherStatePath, parseDispatcherState);
  if (dispatcherState.state !== "valid" || !dispatcherState.record) {
    return {
      agentCount: endpointManifest.record.agents.length,
      dispatcherPid: null,
      dispatcherState: dispatcherState.state,
      dispatcherStatePath,
      endpointManifestPath,
      endpointManifestState: "valid",
      error:
        dispatcherState.state === "invalid"
          ? `Invalid tmux transport dispatcher state at ${dispatcherStatePath}`
          : `Missing tmux transport dispatcher state at ${dispatcherStatePath}`,
      isReady: false,
      lastStartedAt: endpointManifest.record.startedAt,
    };
  }

  if (!isProcessAlive(dispatcherState.record.pid)) {
    return {
      agentCount: endpointManifest.record.agents.length,
      dispatcherPid: dispatcherState.record.pid,
      dispatcherState: "invalid",
      dispatcherStatePath,
      endpointManifestPath,
      endpointManifestState: "valid",
      error: `Tmux transport dispatcher process ${dispatcherState.record.pid} is not running`,
      isReady: false,
      lastStartedAt: dispatcherState.record.startedAt,
    };
  }

  return {
    agentCount: endpointManifest.record.agents.length,
    dispatcherPid: dispatcherState.record.pid,
    dispatcherState: "valid",
    dispatcherStatePath,
    endpointManifestPath,
    endpointManifestState: "valid",
    error: null,
    isReady: true,
    lastStartedAt: dispatcherState.record.startedAt,
  };
}

export async function getConfiguredMissionTransportStatus(
  root: string,
): Promise<ConfiguredMissionTransportStatus> {
  const { transportMode } = readAppConfig(root);

  return getMissionTransportStatus(root, transportMode);
}

export async function getMissionTransportStatus(
  root: string,
  transportMode?: MissionTransportMode | null,
): Promise<ConfiguredMissionTransportStatus> {
  const effectiveTransportMode =
    transportMode === "app-owned" || transportMode === "tmux-resident"
      ? transportMode
      : readAppConfig(root).transportMode;

  if (effectiveTransportMode !== "tmux-resident") {
    return {
      bootstrapStatus: null,
      error: null,
      isReady: true,
      transportMode: effectiveTransportMode,
    };
  }

  const bootstrapStatus = await getTmuxTransportBootstrapStatus(root);
  return {
    bootstrapStatus,
    error: bootstrapStatus.error,
    isReady: bootstrapStatus.isReady,
    transportMode: effectiveTransportMode,
  };
}