import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ALLOWED_AGENTS } from "@/constants/agents";
import type { SessionHistorySummary } from "@/lib/session-history";

export type SessionThreadBindingStatus =
  | "active"
  | "saved"
  | "missing"
  | "restored";

export interface SessionThreadBinding {
  latestSessionId: string | null;
  reboundFromSessionId: string | null;
  status: SessionThreadBindingStatus;
  updatedAt: string;
}

export interface SessionThreadRecord {
  agent: string;
  binding: SessionThreadBinding;
  lastActivityAt: string;
  messageCount: number;
  preview: string;
  sessionIds: string[];
  startedAt: string;
  threadId: string;
  title: string;
  updatedAt: string;
}

export interface SessionThreadSummary {
  agent: string;
  canActivate: boolean;
  canResume: boolean;
  activationDetail: string;
  bindingState: SessionThreadBindingStatus;
  isActive: boolean;
  lastActivityAt: string;
  latestSessionId: string | null;
  messageCount: number;
  preview: string;
  sessionId: string;
  sessionIds: string[];
  startedAt: string;
  status: SessionThreadBindingStatus;
  threadId: string;
  title: string;
  resumeDetail: string | null;
  resumeMode: "resume" | null;
}

export interface AgentSessionThreadState {
  selectedThreadId: string | null;
  threads: SessionThreadRecord[];
}

export interface SessionThreadIndex {
  agents: Partial<Record<string, AgentSessionThreadState>>;
  schemaVersion: 1;
  updatedAt: string;
}

export interface SyncAgentThreadResult {
  didChange: boolean;
  index: SessionThreadIndex;
  state: AgentSessionThreadState;
}

export interface UpsertThreadBindingInput {
  agent: string;
  lastActivityAt?: string;
  latestSessionId: string | null;
  messageCount?: number;
  preview?: string;
  reboundFromSessionId?: string | null;
  selected?: boolean;
  startedAt?: string;
  status: SessionThreadBindingStatus;
  threadId: string;
  title?: string;
  updatedAt?: string;
}

export const SESSION_THREAD_INDEX_SCHEMA_VERSION = 1;
export const SESSION_THREAD_INDEX_PATH =
  "runtime/state/session-thread-index.json";

function getNowIso(): string {
  return new Date().toISOString();
}

export function createEmptySessionThreadIndex(
  now = getNowIso()
): SessionThreadIndex {
  return {
    agents: {},
    schemaVersion: SESSION_THREAD_INDEX_SCHEMA_VERSION,
    updatedAt: now,
  };
}

export function getSessionThreadIndexPath(root: string): string {
  return join(root, SESSION_THREAD_INDEX_PATH);
}

export function readSessionThreadIndex(root: string): SessionThreadIndex {
  const indexPath = getSessionThreadIndexPath(root);
  if (!existsSync(indexPath)) {
    return createEmptySessionThreadIndex();
  }

  try {
    const raw = readFileSync(indexPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SessionThreadIndex> | null;
    if (
      !parsed ||
      parsed.schemaVersion !== SESSION_THREAD_INDEX_SCHEMA_VERSION
    ) {
      return createEmptySessionThreadIndex();
    }

    const index = createEmptySessionThreadIndex(
      typeof parsed.updatedAt === "string" ? parsed.updatedAt : getNowIso()
    );

    for (const agent of ALLOWED_AGENTS) {
      const state = parsed.agents?.[agent];
      if (!state) {
        continue;
      }

      index.agents[agent] = {
        threads: Array.isArray(state.threads)
          ? state.threads
              .map((thread) => normalizeThreadRecord(agent, thread))
              .filter(
                (thread): thread is SessionThreadRecord => thread !== null
              )
          : [],
        selectedThreadId: null,
      };

      const normalizedState = index.agents[agent];
      if (normalizedState) {
        normalizedState.selectedThreadId = resolveSelectedThreadId(
          normalizedState.threads,
          typeof state.selectedThreadId === "string"
            ? state.selectedThreadId
            : null
        );
      }
    }

    return index;
  } catch {
    return createEmptySessionThreadIndex();
  }
}

export function writeSessionThreadIndex(
  root: string,
  index: SessionThreadIndex
): void {
  const indexPath = getSessionThreadIndexPath(root);
  const stateDir = join(root, "runtime/state");
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }

  const nextIndex: SessionThreadIndex = {
    ...index,
    updatedAt: index.updatedAt || getNowIso(),
  };
  const tmpPath = `${indexPath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(nextIndex, null, 2)}\n`, "utf-8");
  renameSync(tmpPath, indexPath);
}

export function buildThreadId(agent: string, sessionId: string): string {
  const digest = createHash("sha1")
    .update(`${agent}:${sessionId}`)
    .digest("hex")
    .slice(0, 12);
  return `thread_${agent}_${digest}`;
}

export function ensureAgentThreadState(
  index: SessionThreadIndex,
  agent: string
): AgentSessionThreadState {
  const existing = index.agents[agent];
  if (existing) {
    existing.threads = sortThreads(existing.threads);
    return existing;
  }

  const created: AgentSessionThreadState = {
    selectedThreadId: null,
    threads: [],
  };
  index.agents[agent] = created;
  return created;
}

export function createThreadRecordFromSummary(
  summary: SessionHistorySummary,
  now = getNowIso()
): SessionThreadRecord {
  const threadId = buildThreadId(summary.agent, summary.sessionId);
  return {
    agent: summary.agent,
    binding: {
      latestSessionId: summary.sessionId,
      reboundFromSessionId: null,
      status: summary.isActive ? "active" : "saved",
      updatedAt: now,
    },
    lastActivityAt: summary.lastActivityAt,
    messageCount: summary.messageCount,
    preview: summary.preview,
    sessionIds: [summary.sessionId],
    startedAt: summary.startedAt,
    threadId,
    title: summary.preview,
    updatedAt: now,
  };
}

export function syncAgentThreadState(
  index: SessionThreadIndex,
  agent: string,
  summaries: readonly SessionHistorySummary[],
  now = getNowIso()
): SyncAgentThreadResult {
  const state = ensureAgentThreadState(index, agent);
  const threadsById = new Map(
    state.threads.map((thread) => [thread.threadId, cloneThreadRecord(thread)])
  );
  const summaryBySessionId = new Map(
    summaries.map((summary) => [summary.sessionId, summary])
  );

  let didChange = state.threads.length === 0 && summaries.length > 0;

  for (const summary of summaries) {
    const existingThread = [...threadsById.values()].find((thread) =>
      thread.sessionIds.includes(summary.sessionId)
    );
    if (existingThread) {
      continue;
    }

    const thread = createThreadRecordFromSummary(summary, now);
    threadsById.set(thread.threadId, thread);
    didChange = true;
  }

  const nextThreads = [...threadsById.values()].map((thread) => {
    const merged = mergeThreadWithSummaries(thread, summaryBySessionId, now);
    if (!areThreadsEqual(thread, merged)) {
      didChange = true;
    }
    return merged;
  });

  const sortedThreads = sortThreads(nextThreads);
  const nextSelectedThreadId = resolveSelectedThreadId(
    sortedThreads,
    state.selectedThreadId
  );
  if (nextSelectedThreadId !== state.selectedThreadId) {
    didChange = true;
  }

  const nextState: AgentSessionThreadState = {
    selectedThreadId: nextSelectedThreadId,
    threads: sortedThreads,
  };

  index.agents[agent] = nextState;
  if (didChange) {
    index.updatedAt = now;
  }

  return {
    didChange,
    index,
    state: nextState,
  };
}

export function setSelectedThreadId(
  index: SessionThreadIndex,
  agent: string,
  threadId: string | null,
  now = getNowIso()
): AgentSessionThreadState {
  const state = ensureAgentThreadState(index, agent);
  const nextSelectedThreadId = resolveSelectedThreadId(state.threads, threadId);
  state.selectedThreadId = nextSelectedThreadId;
  index.updatedAt = now;
  return state;
}

export function getThreadById(
  index: SessionThreadIndex,
  agent: string,
  threadId: string
): SessionThreadRecord | null {
  const state = index.agents[agent];
  if (!state) {
    return null;
  }

  return resolveThreadReference(state.threads, threadId);
}

export function getCanonicalThreadId(
  index: SessionThreadIndex,
  agent: string,
  threadId: string | null | undefined
): string | null {
  if (!threadId) {
    return null;
  }

  return getThreadById(index, agent, threadId)?.threadId ?? null;
}

export function buildThreadSummaries(
  threads: readonly SessionThreadRecord[]
): SessionThreadSummary[] {
  return threads.map((thread) => {
    const actionState = getThreadActionState(thread);
    return {
      agent: thread.agent,
      canActivate: actionState.canActivate,
      canResume: actionState.canResume,
      activationDetail: actionState.activationDetail,
      bindingState: thread.binding.status,
      isActive: thread.binding.status === "active",
      lastActivityAt: thread.lastActivityAt,
      latestSessionId: thread.binding.latestSessionId,
      messageCount: thread.messageCount,
      preview: thread.preview,
      resumeDetail: actionState.resumeDetail,
      resumeMode: actionState.resumeMode,
      sessionId:
        thread.binding.latestSessionId ??
        thread.sessionIds.at(-1) ??
        thread.threadId,
      sessionIds: [...thread.sessionIds],
      startedAt: thread.startedAt,
      status: thread.binding.status,
      threadId: thread.threadId,
      title: thread.title,
    };
  });
}

export interface SessionThreadActionState {
  canActivate: boolean;
  canResume: boolean;
  activationDetail: string;
  resumeDetail: string | null;
  resumeMode: "resume" | null;
}

export function getThreadActionState(
  thread: Pick<SessionThreadRecord, "binding" | "threadId"> | null | undefined
): SessionThreadActionState {
  if (!thread) {
    return {
      canActivate: false,
      canResume: false,
      activationDetail: "No saved thread is selected.",
      resumeDetail: null,
      resumeMode: null,
    };
  }

  if (thread.binding.status === "missing") {
    return {
      canActivate: false,
      canResume: true,
      activationDetail:
        "The latest runtime session for this thread is missing. Start a guided resume session instead of auto-restoring it.",
      resumeDetail:
        "Creates a new runtime session bound to this thread and instructs the agent to read recent history first and inspect earlier history if needed. Prior runtime memory is not restored.",
      resumeMode: "resume",
    };
  }

  if (thread.binding.status === "active") {
    return {
      canActivate: true,
      canResume: false,
      activationDetail:
        "Switch the live runtime to this active thread immediately.",
      resumeDetail: null,
      resumeMode: null,
    };
  }

  if (thread.binding.status === "restored") {
    return {
      canActivate: true,
      canResume: false,
      activationDetail:
        "Switch the live runtime to this rebound thread session immediately.",
      resumeDetail: null,
      resumeMode: null,
    };
  }

  return {
    canActivate: true,
    canResume: false,
    activationDetail:
      "Switch the live runtime to this saved thread immediately.",
    resumeDetail: null,
    resumeMode: null,
  };
}

export function upsertThreadBinding(
  index: SessionThreadIndex,
  input: UpsertThreadBindingInput
): SessionThreadRecord {
  const now = input.updatedAt ?? getNowIso();
  const state = ensureAgentThreadState(index, input.agent);
  const existing =
    state.threads.find((thread) => thread.threadId === input.threadId) ?? null;

  if (!existing) {
    const created: SessionThreadRecord = {
      agent: input.agent,
      binding: {
        latestSessionId: input.latestSessionId,
        reboundFromSessionId: input.reboundFromSessionId ?? null,
        status: input.status,
        updatedAt: now,
      },
      lastActivityAt: input.lastActivityAt ?? now,
      messageCount: input.messageCount ?? 0,
      preview: input.preview ?? "",
      sessionIds: input.latestSessionId ? [input.latestSessionId] : [],
      startedAt: input.startedAt ?? now,
      threadId: input.threadId,
      title: input.title ?? input.preview ?? "",
      updatedAt: now,
    };
    state.threads = sortThreads([...state.threads, created]);
    if (input.selected !== false) {
      state.selectedThreadId = created.threadId;
    } else {
      state.selectedThreadId = resolveSelectedThreadId(
        state.threads,
        state.selectedThreadId
      );
    }
    index.updatedAt = now;
    return created;
  }

  if (
    input.latestSessionId &&
    !existing.sessionIds.includes(input.latestSessionId)
  ) {
    existing.sessionIds = [...existing.sessionIds, input.latestSessionId];
  }

  existing.binding = {
    latestSessionId: input.latestSessionId,
    reboundFromSessionId: input.reboundFromSessionId ?? null,
    status: input.status,
    updatedAt: now,
  };
  existing.lastActivityAt = input.lastActivityAt ?? existing.lastActivityAt;
  existing.messageCount = input.messageCount ?? existing.messageCount;
  existing.preview = input.preview ?? existing.preview;
  existing.startedAt = input.startedAt ?? existing.startedAt;
  existing.title = input.title ?? (existing.title || existing.preview);
  existing.updatedAt = now;

  state.threads = sortThreads([...state.threads]);
  if (input.selected !== false) {
    state.selectedThreadId = existing.threadId;
  }
  state.selectedThreadId = resolveSelectedThreadId(
    state.threads,
    state.selectedThreadId
  );
  index.updatedAt = now;

  return existing;
}

export function resolveSelectedThreadId(
  threads: readonly SessionThreadRecord[],
  preferredThreadId: string | null | undefined
): string | null {
  if (preferredThreadId == null) {
    return threads[0]?.threadId ?? null;
  }

  if (preferredThreadId) {
    const matchedThread = resolveThreadReference(threads, preferredThreadId);
    if (matchedThread) {
      return matchedThread.threadId;
    }
  }

  return null;
}

export function getThreadStateLabel(
  status: SessionThreadBindingStatus
): string {
  if (status === "active") {
    return "active";
  }
  if (status === "restored") {
    return "restored";
  }
  if (status === "missing") {
    return "missing";
  }
  return "saved";
}

function normalizeThreadRecord(
  agent: string,
  value: unknown
): SessionThreadRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Partial<SessionThreadRecord>;
  const latestSessionId =
    typeof record.binding?.latestSessionId === "string"
      ? record.binding.latestSessionId
      : typeof record.sessionIds?.at(-1) === "string"
        ? (record.sessionIds.at(-1) ?? null)
        : null;
  const threadId =
    typeof record.threadId === "string" && record.threadId.length > 0
      ? record.threadId
      : latestSessionId
        ? buildThreadId(agent, latestSessionId)
        : null;
  if (!threadId) {
    return null;
  }

  const sessionIds = Array.isArray(record.sessionIds)
    ? [
        ...new Set(
          record.sessionIds.filter(
            (item): item is string =>
              typeof item === "string" && item.length > 0
          )
        ),
      ]
    : latestSessionId
      ? [latestSessionId]
      : [];

  if (latestSessionId && !sessionIds.includes(latestSessionId)) {
    sessionIds.push(latestSessionId);
  }

  return {
    agent,
    binding: {
      latestSessionId,
      reboundFromSessionId:
        typeof record.binding?.reboundFromSessionId === "string"
          ? record.binding.reboundFromSessionId
          : null,
      status: normalizeBindingStatus(record.binding?.status),
      updatedAt:
        typeof record.binding?.updatedAt === "string"
          ? record.binding.updatedAt
          : getNowIso(),
    },
    lastActivityAt:
      typeof record.lastActivityAt === "string"
        ? record.lastActivityAt
        : getNowIso(),
    messageCount:
      typeof record.messageCount === "number" ? record.messageCount : 0,
    preview: typeof record.preview === "string" ? record.preview : "",
    sessionIds,
    startedAt:
      typeof record.startedAt === "string" ? record.startedAt : getNowIso(),
    threadId,
    title: typeof record.title === "string" ? record.title : "",
    updatedAt:
      typeof record.updatedAt === "string" ? record.updatedAt : getNowIso(),
  };
}

function mergeThreadWithSummaries(
  thread: SessionThreadRecord,
  summaryBySessionId: ReadonlyMap<string, SessionHistorySummary>,
  now: string
): SessionThreadRecord {
  const summaries = thread.sessionIds
    .map((sessionId) => summaryBySessionId.get(sessionId) ?? null)
    .filter((summary): summary is SessionHistorySummary => summary !== null);

  const next = cloneThreadRecord(thread);
  if (
    thread.binding.latestSessionId &&
    !next.sessionIds.includes(thread.binding.latestSessionId)
  ) {
    next.sessionIds.push(thread.binding.latestSessionId);
  }

  if (summaries.length === 0) {
    next.title = next.title || next.preview;
    return next;
  }

  const sorted = [...summaries].sort((left, right) => {
    const diff =
      new Date(right.lastActivityAt).getTime() -
      new Date(left.lastActivityAt).getTime();
    if (diff !== 0) {
      return diff;
    }
    return left.sessionId.localeCompare(right.sessionId);
  });
  const latest = sorted[0];
  const earliest = [...summaries].sort((left, right) => {
    const diff =
      new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime();
    if (diff !== 0) {
      return diff;
    }
    return left.sessionId.localeCompare(right.sessionId);
  })[0];

  next.lastActivityAt = latest.lastActivityAt;
  next.startedAt = earliest.startedAt;
  next.messageCount = summaries.reduce(
    (total, summary) => total + summary.messageCount,
    0
  );
  next.preview = latest.preview || next.preview;
  next.title = next.title || latest.preview || next.preview;
  next.updatedAt = now;

  if (thread.binding.latestSessionId === latest.sessionId && latest.isActive) {
    next.binding.status = "active";
    next.binding.updatedAt = now;
  } else if (thread.binding.status === "active" && !latest.isActive) {
    next.binding.status = "saved";
    next.binding.updatedAt = now;
  }

  return next;
}

function normalizeBindingStatus(value: unknown): SessionThreadBindingStatus {
  return value === "active" ||
    value === "saved" ||
    value === "missing" ||
    value === "restored"
    ? value
    : "saved";
}

function sortThreads(
  threads: readonly SessionThreadRecord[]
): SessionThreadRecord[] {
  return [...threads].sort((left, right) => {
    const diff =
      new Date(right.lastActivityAt).getTime() -
      new Date(left.lastActivityAt).getTime();
    if (diff !== 0) {
      return diff;
    }
    return left.threadId.localeCompare(right.threadId);
  });
}

function resolveThreadReference(
  threads: readonly SessionThreadRecord[],
  reference: string
): SessionThreadRecord | null {
  return (
    threads.find((thread) => thread.threadId === reference) ??
    threads.find(
      (thread) =>
        thread.binding.latestSessionId === reference ||
        thread.sessionIds.includes(reference)
    ) ??
    null
  );
}

function cloneThreadRecord(thread: SessionThreadRecord): SessionThreadRecord {
  return {
    ...thread,
    binding: { ...thread.binding },
    sessionIds: [...thread.sessionIds],
  };
}

function areThreadsEqual(
  left: SessionThreadRecord,
  right: SessionThreadRecord
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
