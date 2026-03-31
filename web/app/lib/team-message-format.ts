import { parse, stringify } from "yaml";
import type { ActivityActorId, ReportStatus, TeamMessageType } from "@/lib/types/mission";

export const TEAM_MESSAGE_MARKER = "[TEAM_MESSAGE]";
export const ROUTED_MESSAGE_MARKER = "[NOCTIS_ROUTED_MESSAGE]";

export type RoutedMessageType = "chat" | "message" | "report";

export interface RoutedSessionMessage {
  speaker: ActivityActorId;
  to: ActivityActorId;
  messageType: RoutedMessageType;
  taskId?: string;
  status?: ReportStatus;
  body?: string;
  summary?: string;
  details?: string;
  artifacts?: string[];
}

const ACTOR_LABELS: Record<ActivityActorId, string> = {
  user: "User",
  noctis: "Noctis",
  ignis: "Ignis",
  gladiolus: "Gladiolus",
  prompto: "Prompto",
  iris: "Iris",
  system: "System",
};

export function getActivityActorLabel(actor: ActivityActorId): string {
  return ACTOR_LABELS[actor] ?? actor;
}

function normalizeActorId(value: unknown): ActivityActorId | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized in ACTOR_LABELS) {
    return normalized as ActivityActorId;
  }

  if (normalized === "gladio") {
    return "gladiolus";
  }

  const byLabel = Object.entries(ACTOR_LABELS).find(
    ([, label]) => label.toLowerCase() === normalized
  );
  return (byLabel?.[0] as ActivityActorId | undefined) ?? null;
}

export function isTeamMessageEnvelope(value: string): boolean {
  const trimmed = value.trimStart();
  return trimmed.includes(ROUTED_MESSAGE_MARKER) || trimmed.includes(TEAM_MESSAGE_MARKER);
}

export function buildRoutedMessageEnvelope(input: RoutedSessionMessage): string {
  const payload: Record<string, unknown> = {
    version: 1,
    speaker: input.speaker,
    to: input.to,
    message_type: input.messageType,
  };

  if (input.taskId) {
    payload.task_id = input.taskId;
  }
  if (input.status) {
    payload.status = input.status;
  }
  if (typeof input.body === "string" && input.body.trim()) {
    payload.body = input.body.trim();
  }
  if (typeof input.summary === "string" && input.summary.trim()) {
    payload.summary = input.summary.trim();
  }
  if (typeof input.details === "string" && input.details.trim()) {
    payload.details = input.details.trim();
  }
  if (input.artifacts && input.artifacts.length > 0) {
    payload.artifacts = input.artifacts;
  }

  return `${ROUTED_MESSAGE_MARKER}\n${stringify(payload).trim()}`;
}

export function buildTeamMessageEnvelope(input: {
  from: ActivityActorId;
  to: ActivityActorId;
  type: TeamMessageType;
  body: string;
  taskId?: string;
  reportStatus?: ReportStatus;
  artifacts?: string[];
  details?: string;
}): string {
  return buildRoutedMessageEnvelope({
    speaker: input.from,
    to: input.to,
    messageType: input.type === "report" ? "report" : "message",
    taskId: input.taskId,
    status: input.reportStatus,
    artifacts: input.artifacts,
    body: input.type === "report" ? undefined : input.body,
    summary: input.type === "report" ? input.body : undefined,
    details: input.type === "report" ? input.details : undefined,
  });
}

function parseLegacyTeamMessageEnvelope(value: string): RoutedSessionMessage | null {
  const markerIndex = value.indexOf(TEAM_MESSAGE_MARKER);
  if (markerIndex < 0) {
    return null;
  }

  const lines = value.slice(markerIndex + TEAM_MESSAGE_MARKER.length).split(/\r?\n/);
  const meta: Record<string, string> = {};
  let index = 0;
  for (; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }
    if (line === "content:") {
      index += 1;
      break;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    meta[key] = rawValue;
  }

  const contentLines = lines.slice(index).join("\n").trim();
  const speaker = normalizeActorId(meta.from);
  const to = normalizeActorId(meta.to);
  const kind = meta.kind;

  if (!speaker || !to || (kind !== "message" && kind !== "report")) {
    return null;
  }

  if (kind === "report") {
    const detailMatch = contentLines.match(/(?:^|\n)details:\s*\n([\s\S]*)$/);
    const summaryMatch = contentLines.match(/summary:\s*(.*?)(?:\n|$)/);
    return {
      speaker,
      to,
      messageType: "report",
      taskId: meta.task_id,
      status: meta.status as ReportStatus | undefined,
      summary: summaryMatch?.[1]?.trim() || contentLines,
      details: detailMatch?.[1]?.trim() || undefined,
    };
  }

  return {
    speaker,
    to,
    messageType: "message",
    taskId: meta.task_id,
    status: meta.status as ReportStatus | undefined,
    body: contentLines,
  };
}

export function parseRoutedMessageEnvelope(value: string): RoutedSessionMessage | null {
  const markerIndex = value.indexOf(ROUTED_MESSAGE_MARKER);
  if (markerIndex >= 0) {
    const yamlText = value.slice(markerIndex + ROUTED_MESSAGE_MARKER.length).trim();
    try {
      const parsed = parse(yamlText) as Record<string, unknown> | null;
      const speaker = normalizeActorId(parsed?.speaker);
      const to = normalizeActorId(parsed?.to);
      const messageType = parsed?.message_type;
      if (
        !speaker ||
        !to ||
        (messageType !== "chat" && messageType !== "message" && messageType !== "report")
      ) {
        return null;
      }

      return {
        speaker,
        to,
        messageType,
        taskId: typeof parsed?.task_id === "string" ? parsed.task_id : undefined,
        status: typeof parsed?.status === "string" ? (parsed.status as ReportStatus) : undefined,
        body: typeof parsed?.body === "string" ? parsed.body : undefined,
        summary: typeof parsed?.summary === "string" ? parsed.summary : undefined,
        details: typeof parsed?.details === "string" ? parsed.details : undefined,
        artifacts: Array.isArray(parsed?.artifacts)
          ? parsed.artifacts.filter((item): item is string => typeof item === "string")
          : undefined,
      };
    } catch {
      return null;
    }
  }

  return parseLegacyTeamMessageEnvelope(value);
}
