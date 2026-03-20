import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ALLOWED_AGENTS } from "@/constants/agents";

export type RuntimeTargetTransportMode =
  | "direct_session"
  | "inbox_fallback"
  | "unsupported";

export type RuntimeTargetSwitchStatus =
  | "failed"
  | "idle"
  | "ready"
  | "switching"
  | "unsupported";

export interface AgentRuntimeTargetState {
  checkedAt: string | null;
  confirmedAt: string | null;
  lastError: string | null;
  selectedSessionId: string | null;
  selectedThreadId: string | null;
  switchStatus: RuntimeTargetSwitchStatus;
  transportMode: RuntimeTargetTransportMode;
  updatedAt: string;
}

export interface RuntimeTargetStateIndex {
  agents: Partial<Record<string, AgentRuntimeTargetState>>;
  schemaVersion: 1;
  updatedAt: string;
}

export interface RuntimeTargetStateUpdate {
  checkedAt?: string | null;
  confirmedAt?: string | null;
  lastError?: string | null;
  selectedSessionId?: string | null;
  selectedThreadId?: string | null;
  switchStatus?: RuntimeTargetSwitchStatus;
  transportMode?: RuntimeTargetTransportMode;
  updatedAt?: string;
}

export const RUNTIME_TARGET_STATE_SCHEMA_VERSION = 1;
export const RUNTIME_TARGET_STATE_PATH =
  "runtime/state/runtime-target-state.json";

function getNowIso(): string {
  return new Date().toISOString();
}

export function getRuntimeTargetStatePath(root: string): string {
  return join(root, RUNTIME_TARGET_STATE_PATH);
}

export function createEmptyRuntimeTargetStateIndex(
  now = getNowIso()
): RuntimeTargetStateIndex {
  return {
    agents: {},
    schemaVersion: RUNTIME_TARGET_STATE_SCHEMA_VERSION,
    updatedAt: now,
  };
}

export function createDefaultAgentRuntimeTargetState(
  now = getNowIso()
): AgentRuntimeTargetState {
  return {
    checkedAt: null,
    confirmedAt: null,
    lastError: null,
    selectedSessionId: null,
    selectedThreadId: null,
    switchStatus: "idle",
    transportMode: "unsupported",
    updatedAt: now,
  };
}

export function readRuntimeTargetState(root: string): RuntimeTargetStateIndex {
  const indexPath = getRuntimeTargetStatePath(root);
  if (!existsSync(indexPath)) {
    return createEmptyRuntimeTargetStateIndex();
  }

  try {
    const raw = readFileSync(indexPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<RuntimeTargetStateIndex> | null;
    if (
      !parsed ||
      parsed.schemaVersion !== RUNTIME_TARGET_STATE_SCHEMA_VERSION
    ) {
      return createEmptyRuntimeTargetStateIndex();
    }

    const index = createEmptyRuntimeTargetStateIndex(
      typeof parsed.updatedAt === "string" ? parsed.updatedAt : getNowIso()
    );

    for (const agent of ALLOWED_AGENTS) {
      const state = parsed.agents?.[agent];
      if (!state) {
        continue;
      }

      index.agents[agent] = normalizeAgentRuntimeTargetState(state);
    }

    return index;
  } catch {
    return createEmptyRuntimeTargetStateIndex();
  }
}

export function writeRuntimeTargetState(
  root: string,
  index: RuntimeTargetStateIndex
): void {
  const indexPath = getRuntimeTargetStatePath(root);
  const stateDir = join(root, "runtime/state");
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }

  const nextIndex: RuntimeTargetStateIndex = {
    ...index,
    updatedAt: index.updatedAt || getNowIso(),
  };
  const tmpPath = `${indexPath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(nextIndex, null, 2)}\n`, "utf-8");
  renameSync(tmpPath, indexPath);
}

export function ensureAgentRuntimeTargetState(
  index: RuntimeTargetStateIndex,
  agent: string,
  now = getNowIso()
): AgentRuntimeTargetState {
  const existing = index.agents[agent];
  if (existing) {
    return existing;
  }

  const created = createDefaultAgentRuntimeTargetState(now);
  index.agents[agent] = created;
  return created;
}

export function updateAgentRuntimeTargetState(
  index: RuntimeTargetStateIndex,
  agent: string,
  update: RuntimeTargetStateUpdate,
  now = getNowIso()
): AgentRuntimeTargetState {
  const state = ensureAgentRuntimeTargetState(index, agent, now);
  const nextUpdatedAt = update.updatedAt ?? now;

  if (Object.hasOwn(update, "checkedAt")) {
    state.checkedAt = update.checkedAt ?? null;
  }
  if (Object.hasOwn(update, "confirmedAt")) {
    state.confirmedAt = update.confirmedAt ?? null;
  }
  if (Object.hasOwn(update, "lastError")) {
    state.lastError = update.lastError ?? null;
  }
  if (Object.hasOwn(update, "selectedSessionId")) {
    state.selectedSessionId = update.selectedSessionId ?? null;
  }
  if (Object.hasOwn(update, "selectedThreadId")) {
    state.selectedThreadId = update.selectedThreadId ?? null;
  }
  if (update.switchStatus) {
    state.switchStatus = update.switchStatus;
  }
  if (update.transportMode) {
    state.transportMode = update.transportMode;
  }

  state.updatedAt = nextUpdatedAt;
  index.updatedAt = nextUpdatedAt;
  return state;
}

export function getRuntimeTargetStateForAgent(
  index: RuntimeTargetStateIndex,
  agent: string
): AgentRuntimeTargetState {
  return ensureAgentRuntimeTargetState(index, agent);
}

function normalizeAgentRuntimeTargetState(
  value: Partial<AgentRuntimeTargetState>
): AgentRuntimeTargetState {
  const now = getNowIso();
  return {
    checkedAt: typeof value.checkedAt === "string" ? value.checkedAt : null,
    confirmedAt:
      typeof value.confirmedAt === "string" ? value.confirmedAt : null,
    lastError: typeof value.lastError === "string" ? value.lastError : null,
    selectedSessionId:
      typeof value.selectedSessionId === "string"
        ? value.selectedSessionId
        : null,
    selectedThreadId:
      typeof value.selectedThreadId === "string"
        ? value.selectedThreadId
        : null,
    switchStatus: normalizeSwitchStatus(value.switchStatus),
    transportMode: normalizeTransportMode(value.transportMode),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : now,
  };
}

function normalizeTransportMode(
  value: unknown
): RuntimeTargetTransportMode {
  return value === "direct_session" ||
    value === "inbox_fallback" ||
    value === "unsupported"
    ? value
    : "unsupported";
}

function normalizeSwitchStatus(
  value: unknown
): RuntimeTargetSwitchStatus {
  return value === "failed" ||
    value === "idle" ||
    value === "ready" ||
    value === "switching" ||
    value === "unsupported"
    ? value
    : "idle";
}
