import type { ChatLogRecord } from "@/lib/chat-timeline";

export interface SessionHistorySummary {
  agent: string;
  isActive: boolean;
  lastActivityAt: string;
  messageCount: number;
  preview: string;
  sessionId: string;
  startedAt: string;
}

const ACTIVE_STATES = new Set(["pending", "running"]);
const FRIENDLY_EVENT_LABELS: Record<string, string> = {
  session_created: "Session created",
  session_resumed: "Session resumed",
  task_assigned: "Task assigned",
  task_completed: "Task completed",
  task_failed: "Task failed",
};
const FRIENDLY_KIND_LABELS: Record<string, string> = {
  error: "Error update",
  plan: "Plan update",
  status: "Status update",
};
const LOW_SIGNAL_TOKENS = new Set([
  "agent_event",
  "answer",
  "event",
  "kind",
  "message",
  "none",
  "null",
  "status",
  "system",
  "tool",
  "tool_result",
  "tool_use",
  "turn",
  "undefined",
  "unknown",
]);
const MACHINE_TOKEN_PATTERN = /^[a-z0-9_.:-]+$/;
const PREVIEW_MAX_LENGTH = 120;

interface MutableSessionHistorySummary extends SessionHistorySummary {
  latestTimestampMs: number;
}

export function parseChatLogLines(
  lines: readonly string[],
  agent?: string
): ChatLogRecord[] {
  return lines
    .map((line) => {
      try {
        return JSON.parse(line) as ChatLogRecord;
      } catch {
        return null;
      }
    })
    .filter(
      (record): record is ChatLogRecord =>
        record !== null && (!agent || record.agent === agent)
    );
}

export function buildSessionHistorySummaries(
  agent: string,
  records: readonly ChatLogRecord[]
): SessionHistorySummary[] {
  const summaries = new Map<string, MutableSessionHistorySummary>();

  for (const record of records) {
    if (record.agent !== agent || !record.session_id) {
      continue;
    }

    const sessionId = record.session_id.trim();
    if (!sessionId) {
      continue;
    }

    const timestampMs = new Date(record.ts).getTime();
    const preview = getRecordPreview(record);
    const isActive = getIsActive(record);
    const existing = summaries.get(sessionId);

    if (!existing) {
      summaries.set(sessionId, {
        agent,
        isActive,
        lastActivityAt: record.ts,
        latestTimestampMs: timestampMs,
        messageCount: 1,
        preview,
        sessionId,
        startedAt: record.ts,
      });
      continue;
    }

    existing.messageCount += 1;
    if (timestampMs < new Date(existing.startedAt).getTime()) {
      existing.startedAt = record.ts;
    }

    if (timestampMs >= existing.latestTimestampMs) {
      existing.lastActivityAt = record.ts;
      existing.latestTimestampMs = timestampMs;
      existing.isActive = isActive;
      if (preview) {
        existing.preview = preview;
      }
    } else if (!existing.preview && preview) {
      existing.preview = preview;
    }
  }

  return [...summaries.values()]
    .sort((left, right) => {
      if (right.latestTimestampMs !== left.latestTimestampMs) {
        return right.latestTimestampMs - left.latestTimestampMs;
      }

      return left.sessionId.localeCompare(right.sessionId);
    })
    .map(({ latestTimestampMs: _latestTimestampMs, ...summary }) => summary);
}

export function getSessionSelectionStorageKey(agent: string): string {
  return `chat_selected_session:${agent}`;
}

export function getMostRecentSessionId(
  summaries: readonly SessionHistorySummary[]
): string | null {
  if (summaries.length === 0) {
    return null;
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

  return sorted[0]?.sessionId ?? null;
}

export function resolveSelectedSessionId(
  summaries: readonly SessionHistorySummary[],
  selectedSessionId: string | null | undefined
): string | null {
  if (selectedSessionId) {
    const hasMatch = summaries.some(
      (summary) => summary.sessionId === selectedSessionId
    );
    if (hasMatch) {
      return selectedSessionId;
    }
  }

  return getMostRecentSessionId(summaries);
}

export function filterChatLogRecordsBySession<T extends ChatLogRecord>(
  records: readonly T[],
  selectedSessionId: string | null | undefined
): T[] {
  if (!selectedSessionId) {
    return [...records];
  }

  return records.filter((record) => record.session_id === selectedSessionId);
}

export function getSessionHistoryPrimaryLabel(
  summary: SessionHistorySummary
): string {
  return summary.preview || getSessionHistoryFallbackLabel(summary.lastActivityAt);
}

export function getSessionHistoryFallbackLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Session activity";
  }

  return `Session from ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)}`;
}

export function getSessionHistoryRelativeTimeLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  const diffMs = date.getTime() - Date.now();
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (Math.abs(diffMs) < hourMs) {
    return formatter.format(Math.round(diffMs / minuteMs), "minute");
  }

  if (Math.abs(diffMs) < dayMs) {
    return formatter.format(Math.round(diffMs / hourMs), "hour");
  }

  return formatter.format(Math.round(diffMs / dayMs), "day");
}

function getIsActive(record: ChatLogRecord): boolean {
  if (record.source === "live_stream") {
    return true;
  }

  return !!record.state && ACTIVE_STATES.has(record.state);
}

function getRecordPreview(record: ChatLogRecord): string {
  const preferredCandidates = [record.content, record.title];
  for (const candidate of preferredCandidates) {
    const normalized = normalizeReadableCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const mappedEvent = normalizeStructuredLabel(record.meta.event, FRIENDLY_EVENT_LABELS);
  if (mappedEvent) {
    return mappedEvent;
  }

  const mappedKind = normalizeStructuredLabel(record.kind, FRIENDLY_KIND_LABELS);
  if (mappedKind) {
    return mappedKind;
  }

  return getRecordFallbackLabel(record.ts);
}

function getRecordFallbackLabel(timestamp: string): string {
  return getSessionHistoryFallbackLabel(timestamp);
}

function normalizeReadableCandidate(candidate: string | undefined): string | null {
  if (typeof candidate !== "string") {
    return null;
  }

  const trimmed = sanitizePreviewCandidate(candidate);
  if (!trimmed || isMachineLikePreview(trimmed)) {
    return null;
  }

  return trimPreview(trimmed);
}

function normalizeStructuredLabel(
  candidate: string | undefined,
  labels: Record<string, string>
): string | null {
  if (typeof candidate !== "string") {
    return null;
  }

  const trimmed = sanitizePreviewCandidate(candidate);
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  const mapped = labels[normalized];
  if (mapped) {
    return trimPreview(mapped);
  }

  if (isMachineLikePreview(trimmed)) {
    return null;
  }

  return trimPreview(trimmed);
}

function sanitizePreviewCandidate(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function isMachineLikePreview(value: string): boolean {
  const normalized = value.toLowerCase();

  if (LOW_SIGNAL_TOKENS.has(normalized)) {
    return true;
  }

  if (normalized.startsWith("{") || normalized.startsWith("[")) {
    return true;
  }

  return MACHINE_TOKEN_PATTERN.test(normalized) &&
    (normalized.includes("_") ||
      normalized.includes(".") ||
      normalized.includes(":") ||
      normalized.includes("-"));
}

function trimPreview(value: string): string {
  if (value.length <= PREVIEW_MAX_LENGTH) {
    return value;
  }

  return `${value.slice(0, PREVIEW_MAX_LENGTH - 1)}…`;
}
