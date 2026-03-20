import fs from "node:fs";
import { join } from "node:path";
import type { Session } from "@opencode-ai/sdk/v2/client";
import { ALLOWED_AGENTS } from "@/constants/agents";
import { getClientForAgent } from "@/lib/opencode-client.server";
import {
  getRuntimeTargetStateForAgent,
  readRuntimeTargetState,
  type RuntimeTargetTransportMode,
  type RuntimeTargetSwitchStatus,
  updateAgentRuntimeTargetState,
  writeRuntimeTargetState,
} from "@/lib/runtime-target-state";
import {
  appendRuntimeTargetAuditRecord,
  createCrystalSessionTransport,
} from "@/lib/session-transport";
import {
  buildThreadId,
  getCanonicalThreadId,
  getThreadActionState,
  getSessionThreadIndexPath,
  getThreadById,
  readSessionThreadIndex,
  type SessionThreadBindingStatus,
  type SessionThreadIndex,
  type SessionThreadRecord,
  setSelectedThreadId,
  upsertThreadBinding,
  writeSessionThreadIndex,
} from "@/lib/session-threads";

export interface SessionResolution {
  action: "activate" | "resume";
  activationDetail: string;
  runtimeTarget: RuntimeTargetSnapshot;
  resumeInstruction: string | null;
  createdSession: Session | null;
  previousSessionId: string | null;
  session: Session;
  status: SessionThreadBindingStatus;
  thread: SessionThreadRecord;
}

export interface SessionReachability {
  reason: "found" | "missing";
  session: Session | null;
}

export interface ThreadSelectionPayload {
  index: SessionThreadIndex;
  selectedThreadId: string | null;
  thread: SessionThreadRecord | null;
}

export interface AbortTargetResolution {
  sessionID: string | null;
  thread: SessionThreadRecord | null;
}

export interface MissingThreadActionDetails {
  activationDetail: string;
  resumeDetail: string | null;
  resumeMode: "resume" | null;
}

export interface RuntimeTargetSnapshot {
  checkedAt: string | null;
  confirmedAt: string | null;
  lastError: string | null;
  selectedSessionId: string | null;
  selectedThreadId: string | null;
  switchStatus: RuntimeTargetSwitchStatus;
  transportMode: RuntimeTargetTransportMode;
  updatedAt: string;
}

export interface RuntimeTargetPromptResult {
  delivery: "direct" | "fallback";
  event: string;
  messageId: string | null;
  promptSessionId: string | null;
  runtimeTarget: RuntimeTargetSnapshot;
  sessionId: string | null;
  threadId: string | null;
}

export interface SessionBindingRequestOptions {
  autoCreate?: boolean;
  reselect?: boolean;
}

export function isAllowedAgent(agent: string): boolean {
  return (ALLOWED_AGENTS as readonly string[]).includes(agent);
}

export function readSessionThreadSelection(
  root: string,
  agent: string
): ThreadSelectionPayload {
  const index = readSessionThreadIndex(root);
  const state = index.agents[agent];
  const selectedThreadId = state?.selectedThreadId ?? null;
  return {
    index,
    selectedThreadId,
    thread:
      selectedThreadId !== null
        ? getThreadById(index, agent, selectedThreadId)
        : null,
  };
}

export function readRuntimeTargetSnapshot(
  root: string,
  agent: string
): RuntimeTargetSnapshot {
  return normalizeRuntimeTargetState(root, agent);
}

export function persistSelectedThread(
  root: string,
  agent: string,
  threadId: string | null
): ThreadSelectionPayload {
  const index = readSessionThreadIndex(root);
  const normalizedThreadId = threadId?.trim() || null;
  const canonicalThreadId = getCanonicalThreadId(
    index,
    agent,
    normalizedThreadId
  );
  const state = setSelectedThreadId(index, agent, canonicalThreadId);
  writeSessionThreadIndex(root, index);
  const selectedThread =
    state.selectedThreadId !== null
      ? getThreadById(index, agent, state.selectedThreadId)
      : null;
  const currentRuntimeTarget = readRuntimeTargetSnapshot(root, agent);
  const shouldPreserveReadyTarget =
    currentRuntimeTarget.switchStatus === "ready" &&
    currentRuntimeTarget.selectedThreadId === state.selectedThreadId &&
    currentRuntimeTarget.selectedSessionId ===
      (selectedThread?.binding.latestSessionId ?? null);

  persistRuntimeTargetSelection(root, agent, {
    lastError:
      shouldPreserveReadyTarget ? currentRuntimeTarget.lastError : null,
    selectedSessionId: selectedThread?.binding.latestSessionId ?? null,
    selectedThreadId: state.selectedThreadId,
    switchStatus: selectedThread
      ? shouldPreserveReadyTarget
        ? currentRuntimeTarget.switchStatus
        : deriveRuntimeTargetSwitchStatus(selectedThread)
      : "unsupported",
    transportMode:
      selectedThread && currentRuntimeTarget.transportMode !== "unsupported"
        ? currentRuntimeTarget.transportMode
        : createCrystalSessionTransport(agent).mode,
  });
  return {
    index,
    selectedThreadId: state.selectedThreadId,
    thread: selectedThread,
  };
}

export async function getReachableSession(
  agent: string,
  root: string,
  sessionID: string | null
): Promise<SessionReachability> {
  if (!sessionID) {
    return { reason: "missing", session: null };
  }

  const client = getClientForAgent(agent);
  if (!client) {
    throw new Error(`No SDK client found for agent: ${agent}`);
  }

  const response = await client.session.get({ directory: root, sessionID });
  if (response.error || !response.data) {
    return { reason: "missing", session: null };
  }

  return { reason: "found", session: response.data };
}

export async function ensureRuntimeTargetSelection(
  root: string,
  agent: string,
  threadId: string | null | undefined
): Promise<RuntimeTargetSnapshot> {
  const normalizedThreadId = threadId?.trim();
  if (!normalizedThreadId) {
    throw new Error("threadId is required");
  }
  const resolution = await resolveThreadSessionBinding(
    root,
    agent,
    normalizedThreadId,
    {
      autoCreate: false,
    }
  );
  return resolution.runtimeTarget;
}

export async function resolveThreadSessionBinding(
  root: string,
  agent: string,
  threadId: string,
  options?: SessionBindingRequestOptions
): Promise<SessionResolution> {
  const index = readSessionThreadIndex(root);
  const normalizedThreadId = threadId.trim();
  if (!normalizedThreadId) {
    throw new Error("threadId is required");
  }
  const thread = getThreadById(index, agent, normalizedThreadId);
  if (!thread) {
    throw new Error(`Unknown thread: ${normalizedThreadId}`);
  }

  const client = getClientForAgent(agent);
  if (!client) {
    throw new Error(`No SDK client found for agent: ${agent}`);
  }

  const reachable = await getReachableSession(
    agent,
    root,
    thread.binding.latestSessionId
  );

  if (reachable.session) {
    const refreshedThread = upsertThreadBinding(index, {
      agent,
      latestSessionId: reachable.session.id,
      lastActivityAt: thread.lastActivityAt,
      messageCount: thread.messageCount,
      preview: thread.preview,
      selected: options?.reselect !== false,
      startedAt: thread.startedAt,
      status: isSessionActive(agent, reachable.session.id)
        ? "active"
        : thread.binding.status === "restored"
          ? "restored"
          : "saved",
      threadId: thread.threadId,
      title: thread.title,
      updatedAt: new Date().toISOString(),
    });
      writeSessionThreadIndex(root, index);
      const runtimeTarget = persistRuntimeTargetSelection(root, agent, {
        lastError: null,
        selectedSessionId: reachable.session.id,
        selectedThreadId: refreshedThread.threadId,
        switchStatus: "ready",
        transportMode: createCrystalSessionTransport(agent).mode,
      });
      appendRuntimeTargetAuditRecord(root, {
        action: "runtime_target_ready",
        agent,
        content: `Runtime target confirmed for ${refreshedThread.threadId}.`,
        sessionId: reachable.session.id,
        source: "system",
        switchStatus: runtimeTarget.switchStatus,
        threadId: refreshedThread.threadId,
        transportMode: runtimeTarget.transportMode,
      });

      return {
        action: "activate",
        activationDetail: getThreadActionState(refreshedThread).activationDetail,
        runtimeTarget,
        resumeInstruction: null,
        createdSession: null,
      previousSessionId: null,
      session: reachable.session,
      status: refreshedThread.binding.status,
      thread: refreshedThread,
    };
  }

  const now = new Date().toISOString();
  upsertThreadBinding(index, {
    agent,
    latestSessionId: thread.binding.latestSessionId,
    lastActivityAt: thread.lastActivityAt,
    messageCount: thread.messageCount,
    preview: thread.preview,
    reboundFromSessionId: thread.binding.latestSessionId,
    selected: options?.reselect !== false,
    startedAt: thread.startedAt,
    status: "missing",
    threadId: thread.threadId,
    title: thread.title,
    updatedAt: now,
  });

  if (options?.autoCreate === false) {
    writeSessionThreadIndex(root, index);
    persistRuntimeTargetSelection(root, agent, {
      checkedAt: now,
      lastError: "Bound session is missing",
      selectedSessionId: thread.binding.latestSessionId,
      selectedThreadId: thread.threadId,
      switchStatus: "failed",
      transportMode: createCrystalSessionTransport(agent).mode,
    });
    const missingThread = getThreadById(index, agent, thread.threadId);
    if (!missingThread) {
      throw new Error(`Unknown thread after missing-state update: ${threadId}`);
    }
    throw new MissingBoundSessionError(missingThread);
  }

  const createdSession = await createSessionForThread(root, agent, {
    title: thread.title || `Session ${agent} ${Date.now()}`,
  });

  appendSessionRestoredRecord(root, agent, {
    newSessionId: createdSession.id,
    previousSessionId: thread.binding.latestSessionId,
  });

  const restoredThread = upsertThreadBinding(index, {
    agent,
    latestSessionId: createdSession.id,
    lastActivityAt: now,
    messageCount: thread.messageCount,
    preview: thread.preview,
    reboundFromSessionId: thread.binding.latestSessionId,
    selected: options?.reselect !== false,
    startedAt: thread.startedAt,
    status: "restored",
    threadId: thread.threadId,
    title: thread.title,
    updatedAt: now,
  });
  writeSessionThreadIndex(root, index);
  const runtimeTarget = persistRuntimeTargetSelection(root, agent, {
    lastError: null,
    selectedSessionId: createdSession.id,
    selectedThreadId: restoredThread.threadId,
    switchStatus: "ready",
    transportMode: createCrystalSessionTransport(agent).mode,
  });
  appendRuntimeTargetAuditRecord(root, {
    action: "runtime_target_ready",
    agent,
    content: `Runtime target restored for ${restoredThread.threadId}.`,
    sessionId: createdSession.id,
    source: "system",
    switchStatus: runtimeTarget.switchStatus,
    threadId: restoredThread.threadId,
    transportMode: runtimeTarget.transportMode,
  });

  return {
    action: "resume",
    activationDetail: getThreadActionState(restoredThread).activationDetail,
    runtimeTarget,
    resumeInstruction: null,
    createdSession,
    previousSessionId: thread.binding.latestSessionId,
    session: createdSession,
    status: "restored",
    thread: restoredThread,
  };
}

export async function createAndBindThreadSession(
  root: string,
  agent: string,
  options?: {
    mode?: "create" | "resume";
    preferredThreadId?: string | null;
    resumeInstruction?: string | null;
    title?: string;
  }
): Promise<SessionResolution> {
  const index = readSessionThreadIndex(root);
  const selectedThreadId =
    getCanonicalThreadId(
      index,
      agent,
      options?.preferredThreadId?.trim() || null
    ) ??
    index.agents[agent]?.selectedThreadId ??
    null;
  const existingThread =
    selectedThreadId !== null
      ? getThreadById(index, agent, selectedThreadId)
      : null;

  const createdSession = await createSessionForThread(root, agent, {
    title: options?.title,
  });
  const now = new Date().toISOString();
  const threadId =
    existingThread?.threadId ?? buildThreadId(agent, createdSession.id);
  const thread = upsertThreadBinding(index, {
    agent,
    latestSessionId: createdSession.id,
    lastActivityAt: now,
    messageCount: existingThread?.messageCount ?? 0,
    preview: existingThread?.preview ?? "",
    reboundFromSessionId: null,
    selected: true,
    startedAt: existingThread?.startedAt ?? now,
    status: isSessionActive(agent, createdSession.id) ? "active" : "saved",
    threadId,
    title:
      existingThread?.title ??
      options?.title ??
      `Session ${agent} ${createdSession.time.created}`,
    updatedAt: now,
  });

  writeSessionThreadIndex(root, index);

  const mode = options?.mode === "resume" ? "resume" : "create";
  const resumeInstruction =
    mode === "resume"
      ? (options?.resumeInstruction ??
        buildResumeInstruction({
          agent,
          thread,
          previousSessionId: existingThread?.binding.latestSessionId ?? null,
        }))
      : null;

  if (resumeInstruction) {
    appendSessionResumeRecord(root, agent, {
      newSessionId: createdSession.id,
      previousSessionId: existingThread?.binding.latestSessionId ?? null,
      threadId,
    });
  }

  const runtimeTarget = persistRuntimeTargetSelection(root, agent, {
    lastError: null,
    selectedSessionId: createdSession.id,
    selectedThreadId: thread.threadId,
    switchStatus: "ready",
    transportMode: createCrystalSessionTransport(agent).mode,
  });
  appendRuntimeTargetAuditRecord(root, {
    action: mode === "resume" ? "runtime_target_resumed" : "runtime_target_ready",
    agent,
    content:
      mode === "resume"
        ? `Runtime target resumed for ${thread.threadId}.`
        : `Runtime target created for ${thread.threadId}.`,
    sessionId: createdSession.id,
    source: "system",
    switchStatus: runtimeTarget.switchStatus,
    threadId: thread.threadId,
    transportMode: runtimeTarget.transportMode,
  });

  return {
    action: mode === "resume" ? "resume" : "activate",
    activationDetail: getThreadActionState(thread).activationDetail,
    runtimeTarget,
    resumeInstruction,
    createdSession,
    previousSessionId: existingThread?.binding.latestSessionId ?? null,
    session: createdSession,
    status: thread.binding.status,
    thread,
  };
}

export function getMissingThreadActionDetails(
  thread: SessionThreadRecord | null | undefined
): MissingThreadActionDetails {
  const actionState = getThreadActionState(thread);
  return {
    activationDetail: actionState.activationDetail,
    resumeDetail: actionState.resumeDetail,
    resumeMode: actionState.resumeMode,
  };
}

export async function sendCrystalPromptToRuntimeTarget(
  root: string,
  agent: string,
  content: string,
  options?: {
    fallbackToInbox?: boolean;
    sessionId?: string | null;
    threadId?: string | null;
  }
): Promise<RuntimeTargetPromptResult> {
  const runtimeTarget = readRuntimeTargetSnapshot(root, agent);
  const threadId =
    options?.threadId ?? runtimeTarget.selectedThreadId ?? null;
  const sessionId =
    options?.sessionId ?? runtimeTarget.selectedSessionId ?? null;
  const transport = createCrystalSessionTransport(agent);

  if (
    sessionId !== runtimeTarget.selectedSessionId ||
    threadId !== runtimeTarget.selectedThreadId
  ) {
    persistRuntimeTargetSelection(root, agent, {
      checkedAt: runtimeTarget.checkedAt,
      confirmedAt: runtimeTarget.confirmedAt,
      lastError: runtimeTarget.lastError,
      selectedSessionId: sessionId,
      selectedThreadId: threadId,
      switchStatus: runtimeTarget.switchStatus,
      transportMode: runtimeTarget.transportMode,
    });
  }

  if (transport.mode !== "direct_session" && options?.fallbackToInbox === false) {
    persistRuntimeTargetSelection(root, agent, {
      checkedAt: new Date().toISOString(),
      lastError: "Explicit runtime session transport is unavailable",
      selectedSessionId: sessionId,
      selectedThreadId: threadId,
      switchStatus: "unsupported",
      transportMode: transport.mode,
    });
    throw new Error("Explicit runtime session transport is unavailable");
  }

  const result = await transport.sendCrystalPrompt({
    agent,
    content,
    root,
    sessionId,
    threadId,
  });
  const persistedRuntimeTarget = persistRuntimeTargetSelection(root, agent, {
    checkedAt: new Date().toISOString(),
    confirmedAt: result.delivery === "direct" ? new Date().toISOString() : null,
    lastError: null,
    selectedSessionId: result.sessionId,
    selectedThreadId: threadId,
    switchStatus: result.switchStatus,
    transportMode: result.transportMode,
  });

  return {
    delivery: result.delivery,
    event: result.event,
    messageId: result.messageId,
    promptSessionId: result.sessionId,
    runtimeTarget: persistedRuntimeTarget,
    sessionId: result.sessionId,
    threadId,
  };
}

export function buildResumeInstruction(payload: {
  agent: string;
  previousSessionId: string | null;
  thread: Pick<
    SessionThreadRecord,
    "lastActivityAt" | "messageCount" | "threadId" | "title"
  >;
}): string {
  const title = payload.thread.title.trim() || `thread ${payload.thread.threadId}`;
  const previousSessionLine = payload.previousSessionId
    ? `Previous runtime session: ${payload.previousSessionId}.`
    : "Previous runtime session is unavailable.";
  return [
    `Resume thread "${title}" without assuming prior runtime memory.`,
    previousSessionLine,
    `Read recent history for thread ${payload.thread.threadId} first (${payload.thread.messageCount} recorded messages, last activity ${payload.thread.lastActivityAt}).`,
    "If the immediate context is insufficient, inspect earlier history before taking action.",
    "State explicitly when older context was required. Do not claim true memory restoration.",
  ].join(" ");
}

export async function resolveAbortTarget(
  root: string,
  agent: string,
  sessionID: string | null,
  threadId: string | null
): Promise<AbortTargetResolution> {
  const index = readSessionThreadIndex(root);
  const normalizedSessionId = sessionID?.trim() || null;
  const normalizedThreadId = threadId?.trim() || null;
  const selectedThreadId =
    normalizedThreadId ??
    normalizedSessionId ??
    index.agents[agent]?.selectedThreadId ??
    null;
  const thread =
    selectedThreadId !== null
      ? getThreadById(index, agent, selectedThreadId)
      : null;

  if (normalizedSessionId) {
    if (thread) {
      return {
        sessionID: thread.binding.latestSessionId ?? normalizedSessionId,
        thread,
      };
    }

    return { sessionID: normalizedSessionId, thread: null };
  }

  const boundSessionId = thread?.binding.latestSessionId ?? null;

  if (boundSessionId) {
    const reachable = await getReachableSession(agent, root, boundSessionId);
    if (reachable.session) {
      return { sessionID: boundSessionId, thread };
    }

    upsertThreadBinding(index, {
      agent,
      latestSessionId: boundSessionId,
      lastActivityAt: thread?.lastActivityAt,
      messageCount: thread?.messageCount,
      preview: thread?.preview,
      reboundFromSessionId: thread?.binding.reboundFromSessionId ?? null,
      selected: true,
      startedAt: thread?.startedAt,
      status: "missing",
      threadId: thread?.threadId ?? selectedThreadId ?? boundSessionId,
      title: thread?.title,
      updatedAt: new Date().toISOString(),
    });
    writeSessionThreadIndex(root, index);
  }

  return { sessionID: null, thread };
}

export class MissingBoundSessionError extends Error {
  thread: SessionThreadRecord;

  constructor(thread: SessionThreadRecord) {
    super(`Missing bound session for thread: ${thread.threadId}`);
    this.name = "MissingBoundSessionError";
    this.thread = thread;
  }
}

function persistRuntimeTargetSelection(
  root: string,
  agent: string,
  update: {
    checkedAt?: string | null;
    confirmedAt?: string | null;
    lastError?: string | null;
    selectedSessionId?: string | null;
    selectedThreadId?: string | null;
    switchStatus: RuntimeTargetSwitchStatus;
    transportMode: RuntimeTargetTransportMode;
  }
): RuntimeTargetSnapshot {
  const now = new Date().toISOString();
  const runtimeTargetState = readRuntimeTargetState(root);
  const state = updateAgentRuntimeTargetState(runtimeTargetState, agent, {
    checkedAt: update.checkedAt ?? now,
    confirmedAt:
      update.switchStatus === "ready"
        ? (update.confirmedAt ?? now)
        : (update.confirmedAt ?? null),
    lastError: update.lastError ?? null,
    selectedSessionId: update.selectedSessionId ?? null,
    selectedThreadId: update.selectedThreadId ?? null,
    switchStatus: update.switchStatus,
    transportMode: update.transportMode,
    updatedAt: now,
  });
  writeRuntimeTargetState(root, runtimeTargetState);
  return toRuntimeTargetSnapshot(state);
}

function normalizeRuntimeTargetState(
  root: string,
  agent: string
): RuntimeTargetSnapshot {
  const runtimeTargetState = readRuntimeTargetState(root);
  const current = getRuntimeTargetStateForAgent(runtimeTargetState, agent);
  const selection = readSessionThreadSelection(root, agent);
  const selectedThread = selection.thread;
  const selectedSessionId = selectedThread?.binding.latestSessionId ?? null;
  const transportMode = createCrystalSessionTransport(agent).mode;
  const derivedSwitchStatus = selectedThread
    ? deriveRuntimeTargetSwitchStatus(selectedThread)
    : transportMode === "unsupported"
      ? "unsupported"
      : "idle";
  const needsNormalization =
    current.selectedThreadId !== selection.selectedThreadId ||
    current.selectedSessionId !== selectedSessionId ||
    (!selectedThread && current.switchStatus !== derivedSwitchStatus) ||
    (selectedThread &&
      ((current.switchStatus === "idle" && derivedSwitchStatus === "ready") ||
        current.switchStatus === "unsupported" ||
        current.transportMode !== transportMode));

  if (!needsNormalization) {
    return toRuntimeTargetSnapshot(current);
  }

  const normalized = updateAgentRuntimeTargetState(runtimeTargetState, agent, {
    checkedAt: current.checkedAt,
    confirmedAt:
      derivedSwitchStatus === "ready"
        ? (current.confirmedAt ?? new Date().toISOString())
        : null,
    lastError: derivedSwitchStatus === "failed" ? current.lastError : null,
    selectedSessionId,
    selectedThreadId: selection.selectedThreadId,
    switchStatus: derivedSwitchStatus,
    transportMode,
    updatedAt: new Date().toISOString(),
  });
  writeRuntimeTargetState(root, runtimeTargetState);
  return toRuntimeTargetSnapshot(normalized);
}

function deriveRuntimeTargetSwitchStatus(
  thread: SessionThreadRecord
): RuntimeTargetSwitchStatus {
  if (!thread.binding.latestSessionId) {
    return "idle";
  }

  if (thread.binding.status === "missing") {
    return "failed";
  }

  return "ready";
}

function toRuntimeTargetSnapshot(
  value: ReturnType<typeof getRuntimeTargetStateForAgent>
): RuntimeTargetSnapshot {
  return {
    checkedAt: value.checkedAt,
    confirmedAt: value.confirmedAt,
    lastError: value.lastError,
    selectedSessionId: value.selectedSessionId,
    selectedThreadId: value.selectedThreadId,
    switchStatus: value.switchStatus,
    transportMode: value.transportMode,
    updatedAt: value.updatedAt,
  };
}

async function createSessionForThread(
  root: string,
  agent: string,
  options?: { title?: string }
): Promise<Session> {
  const client = getClientForAgent(agent);
  if (!client) {
    throw new Error(`No SDK client found for agent: ${agent}`);
  }

  const title = options?.title?.trim() || `Session ${agent} ${Date.now()}`;
  const response = await client.session.create({
    directory: root,
    title,
  });
  if (response.error || !response.data) {
    throw new Error(String(response.error ?? "Session creation failed"));
  }

  return response.data;
}

function appendSessionRestoredRecord(
  root: string,
  agent: string,
  payload: { newSessionId: string; previousSessionId: string | null }
): void {
  const logPath = join(root, "runtime/logs/agent-chat-monitor.jsonl");
  const record = {
    agent,
    content: payload.previousSessionId
      ? `Restored thread from ${payload.previousSessionId}.`
      : "Restored thread.",
    data: {
      previousSessionId: payload.previousSessionId,
      restoredSessionId: payload.newSessionId,
    },
    id: `session-restored-${Date.now()}`,
    kind: "status",
    meta: {
      event: "session_restored",
      pane: "runtime-target",
    },
    session_id: payload.newSessionId,
    source: "system",
    ts: new Date().toISOString(),
  };
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf-8");
}

function appendSessionResumeRecord(
  root: string,
  agent: string,
  payload: { newSessionId: string; previousSessionId: string | null; threadId: string }
): void {
  const logPath = join(root, "runtime/logs/agent-chat-monitor.jsonl");
  const record = {
    agent,
    content: payload.previousSessionId
      ? `Started guided resume from ${payload.previousSessionId}.`
      : "Started guided resume for selected thread.",
    data: {
      previousSessionId: payload.previousSessionId,
      resumedSessionId: payload.newSessionId,
      threadId: payload.threadId,
    },
    id: `session-resume-${Date.now()}`,
    kind: "status",
    meta: {
      event: "session_resume_started",
      pane: "runtime-target",
    },
    session_id: payload.newSessionId,
    source: "system",
    ts: new Date().toISOString(),
  };
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf-8");
}

function isSessionActive(agent: string, sessionID: string): boolean {
  return Boolean(getClientForAgent(agent) && sessionID);
}

export function getSessionThreadIndexLocation(root: string): string {
  return getSessionThreadIndexPath(root);
}
