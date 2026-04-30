import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getProjectRoot } from "@/lib/get-project-root.server";
import type { AgentId } from "@/lib/types/mission";

export const TMUX_TRANSPORT_ABORT_REQUEST_DIR = "tmux-transport-aborts";
export const TMUX_TRANSPORT_CURRENT_DISPATCH_FILE = "tmux-transport-current-dispatch.json";

export type TmuxTransportOwnerAgent = AgentId | "iris";

const TMUX_AGENT_PANE_INDEX: Record<TmuxTransportOwnerAgent, number> = {
  noctis: 0,
  ignis: 1,
  gladiolus: 2,
  prompto: 3,
  lunafreya: 4,
  iris: 5,
};
const TMUX_SESSION_NAME = "ff15";

export type TmuxDispatchPhase =
  | "switch-session"
  | "switch-model"
  | "switch-variant"
  | "typing-payload"
  | "submit-payload";

export type ManagedTmuxInterruptMethod = "ctrl-c" | "escape";

export interface TmuxCurrentDispatchRecord {
  agent: TmuxTransportOwnerAgent;
  itemId: string;
  missionId: string;
  phase: TmuxDispatchPhase;
  sessionId: string;
  target: string;
  updatedAt: string;
}

function getAbortRequestDir(root: string): string {
  return join(root, "runtime", TMUX_TRANSPORT_ABORT_REQUEST_DIR);
}

function getAbortRequestPath(root: string, sessionId: string): string {
  return join(getAbortRequestDir(root), `${sessionId}.json`);
}

function getCurrentDispatchPath(root: string): string {
  return join(root, "runtime", TMUX_TRANSPORT_CURRENT_DISPATCH_FILE);
}

function isDispatchPhase(value: unknown): value is TmuxDispatchPhase {
  return (
    value === "switch-session" ||
    value === "switch-model" ||
    value === "switch-variant" ||
    value === "typing-payload" ||
    value === "submit-payload"
  );
}

function isAgentId(value: unknown): value is TmuxTransportOwnerAgent {
  return (
    value === "noctis" ||
    value === "ignis" ||
    value === "gladiolus" ||
    value === "prompto" ||
    value === "lunafreya" ||
    value === "iris"
  );
}

function normalizeCurrentDispatch(value: unknown): TmuxCurrentDispatchRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    !isAgentId(record.agent) ||
    typeof record.itemId !== "string" ||
    typeof record.missionId !== "string" ||
    !isDispatchPhase(record.phase) ||
    typeof record.sessionId !== "string" ||
    typeof record.target !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    agent: record.agent,
    itemId: record.itemId,
    missionId: record.missionId,
    phase: record.phase,
    sessionId: record.sessionId,
    target: record.target,
    updatedAt: record.updatedAt,
  };
}

function toTmuxKey(method: ManagedTmuxInterruptMethod): "C-c" | "Escape" {
  return method === "ctrl-c" ? "C-c" : "Escape";
}

export function readCurrentTmuxDispatch(root = getProjectRoot()): TmuxCurrentDispatchRecord | null {
  const currentDispatchPath = getCurrentDispatchPath(root);
  if (!existsSync(currentDispatchPath)) {
    return null;
  }

  try {
    return normalizeCurrentDispatch(JSON.parse(readFileSync(currentDispatchPath, "utf-8")));
  } catch {
    return null;
  }
}

export function requestTmuxDispatchAbortForSession(input: {
  missionId: string;
  requestedAt?: string;
  requestedBy: string;
  root?: string;
  sessionId: string;
}): {
  currentDispatch: TmuxCurrentDispatchRecord | null;
  requested: boolean;
} {
  const root = input.root ?? getProjectRoot();
  const currentDispatch = readCurrentTmuxDispatch(root);

  if (
    !currentDispatch ||
    currentDispatch.missionId !== input.missionId ||
    currentDispatch.sessionId !== input.sessionId
  ) {
    return {
      currentDispatch,
      requested: false,
    };
  }

  const requestedAt = input.requestedAt ?? new Date().toISOString();
  mkdirSync(getAbortRequestDir(root), { recursive: true });
  writeFileSync(
    getAbortRequestPath(root, input.sessionId),
    `${JSON.stringify(
      {
        missionId: input.missionId,
        requestedAt,
        requestedBy: input.requestedBy,
        sessionId: input.sessionId,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  return {
    currentDispatch,
    requested: true,
  };
}

export function interruptManagedTmuxSession(input: {
  method: ManagedTmuxInterruptMethod;
  ownerAgent: TmuxTransportOwnerAgent;
  root?: string;
}): void {
  const root = input.root ?? getProjectRoot();
  const target = `${TMUX_SESSION_NAME}:main.${TMUX_AGENT_PANE_INDEX[input.ownerAgent]}`;
  const key = toTmuxKey(input.method);
  const result = spawnSync("tmux", ["send-keys", "-t", target, key], {
    cwd: root,
    encoding: "utf-8",
  });

  if ((result.status ?? 1) !== 0) {
    throw new Error(result.stderr || `Failed to send ${key} to ${target}`);
  }
}