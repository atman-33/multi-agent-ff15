import { spawnSync } from "node:child_process";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { listSessionStatusTargets } from "@/lib/session-owner-routing.server";
import { coerceSessionStatus } from "@/lib/session-status";
import {
  getConfiguredMissionTransportStatus,
  type TmuxTransportBootstrapStatus,
} from "@/lib/tmux-transport-bootstrap.server";

export type TmuxMonitorAgentId =
  | "noctis"
  | "ignis"
  | "gladiolus"
  | "prompto"
  | "lunafreya"
  | "iris";

export type TmuxMonitorAgentStatus = "busy" | "idle" | "retry" | "offline" | "unknown";

export type TmuxMonitorPane = {
  agentId: TmuxMonitorAgentId;
  content: string;
  paneIndex: number;
  target: string;
};

export type TmuxMonitorSnapshot = {
  agentStatuses: Record<TmuxMonitorAgentId, TmuxMonitorAgentStatus>;
  bootstrapStatus: TmuxTransportBootstrapStatus | null;
  panes: TmuxMonitorPane[];
  transportMode: string;
};

const TMUX_MONITOR_PANES: ReadonlyArray<{ agentId: TmuxMonitorAgentId; paneIndex: number }> = [
  { agentId: "noctis", paneIndex: 0 },
  { agentId: "ignis", paneIndex: 1 },
  { agentId: "gladiolus", paneIndex: 2 },
  { agentId: "prompto", paneIndex: 3 },
  { agentId: "lunafreya", paneIndex: 4 },
  { agentId: "iris", paneIndex: 5 },
];

const PANE_CAPTURE_TIMEOUT_MS = 2000;
const TMUX_SESSION_NAME = "ff15";
const MISSING_PANE_MESSAGE = "Pane not available.";

function deriveAgentStatus(value: unknown): TmuxMonitorAgentStatus {
  if (!value || typeof value !== "object") {
    return "idle";
  }

  const entries = Object.values(value as Record<string, unknown>)
    .map((entry) => coerceSessionStatus(entry))
    .filter((status): status is NonNullable<typeof status> => status !== null);

  if (entries.includes("busy")) {
    return "busy";
  }

  if (entries.includes("retry")) {
    return "retry";
  }

  return entries[0] ?? "idle";
}

async function readAgentStatuses(): Promise<Record<TmuxMonitorAgentId, TmuxMonitorAgentStatus>> {
  const statuses = Object.fromEntries(
    TMUX_MONITOR_PANES.map(({ agentId }) => [agentId, "unknown"]),
  ) as Record<TmuxMonitorAgentId, TmuxMonitorAgentStatus>;

  for (const target of listSessionStatusTargets()) {
    const agentId = target.agentId as TmuxMonitorAgentId;
    if (!(agentId in statuses)) {
      continue;
    }

    try {
      const result = await target.client.session.status();
      if (result.error) {
        statuses[agentId] = "offline";
        continue;
      }

      statuses[agentId] = deriveAgentStatus(result.data ?? {});
    } catch {
      statuses[agentId] = "offline";
    }
  }

  return statuses;
}

function readPanes(root: string): TmuxMonitorPane[] {
  return TMUX_MONITOR_PANES.map(({ agentId, paneIndex }) => {
    const target = `${TMUX_SESSION_NAME}:main.${paneIndex}`;
    const result = spawnSync("tmux", ["capture-pane", "-t", target, "-p", "-e"], {
      cwd: root,
      encoding: "utf-8",
      timeout: PANE_CAPTURE_TIMEOUT_MS,
    });

    return {
      agentId,
      content: (result.status ?? 1) === 0 ? (result.stdout ?? "") : MISSING_PANE_MESSAGE,
      paneIndex,
      target,
    };
  });
}

export async function readTmuxMonitorSnapshot(root = getProjectRoot()): Promise<TmuxMonitorSnapshot> {
  const transportStatus = await getConfiguredMissionTransportStatus(root);
  if (transportStatus.transportMode !== "tmux-resident") {
    return {
      agentStatuses: Object.fromEntries(
        TMUX_MONITOR_PANES.map(({ agentId }) => [agentId, "unknown"]),
      ) as Record<TmuxMonitorAgentId, TmuxMonitorAgentStatus>,
      bootstrapStatus: null,
      panes: [],
      transportMode: transportStatus.transportMode,
    };
  }

  const [agentStatuses, panes] = await Promise.all([readAgentStatuses(), Promise.resolve(readPanes(root))]);

  return {
    agentStatuses,
    bootstrapStatus: transportStatus.bootstrapStatus,
    panes,
    transportMode: transportStatus.transportMode,
  };
}