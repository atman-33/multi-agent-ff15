import type { Plugin } from "@opencode-ai/plugin";

type OwnerAgent = "noctis" | "ignis" | "gladiolus" | "prompto";

type OwnerResolution = {
  agentId: OwnerAgent;
  missionId: string | null;
  source: "session-title" | "mission-store" | "session-title+mission-store";
  title: string | null;
  mismatch: boolean;
};

type ProbeRecord = {
  timestamp: string;
  eventType: string;
  sessionId: string;
  missionId: string | null;
  ownerAgent: OwnerAgent | null;
  resolutionSource: string | null;
  sessionTitle: string | null;
  mismatch: boolean;
  message: string | null;
};

const RESOLVE_SESSION_OWNER_SCRIPT = ".opencode/plugins/lib/resolve_session_owner.py";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeContent(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSessionId(event: Record<string, unknown>): string | null {
  const props = asRecord(event.properties);
  const part = asRecord(props?.part);
  const candidates = [
    event.session_id,
    event.sessionID,
    event.sessionId,
    event.id,
    props?.session_id,
    props?.sessionID,
    props?.sessionId,
    props?.id,
    part?.session_id,
    part?.sessionID,
    part?.sessionId,
    part?.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

function parseMissionTitle(title: string): { missionId: string | null; agentId: OwnerAgent | null } {
  const workerMatch = /^mission:([^:]+):(ignis|gladiolus|prompto)$/.exec(title);
  if (workerMatch) {
    return {
      missionId: workerMatch[1],
      agentId: workerMatch[2] as OwnerAgent,
    };
  }

  const noctisMatch = /^mission:([^:]+)$/.exec(title);
  if (noctisMatch) {
    return {
      missionId: noctisMatch[1],
      agentId: "noctis",
    };
  }

  return { missionId: null, agentId: null };
}

async function resolveOwnerFromSessionTitle(client: unknown, sessionId: string): Promise<{
  agentId: OwnerAgent;
  missionId: string | null;
  title: string | null;
} | null> {
  const clientRecord = asRecord(client);
  const sessionApi = asRecord(clientRecord?.session);
  const list = sessionApi?.list;

  if (typeof list !== "function") {
    return null;
  }

  try {
    const result = await (list as () => Promise<unknown>)();
    const resultRecord = asRecord(result);
    const sessions = Array.isArray(resultRecord?.data) ? resultRecord.data : [];

    for (const session of sessions) {
      const sessionRecord = asRecord(session);
      if (!sessionRecord || sessionRecord.id !== sessionId) {
        continue;
      }

      const info = asRecord(sessionRecord.info);
      const title =
        typeof sessionRecord.title === "string"
          ? sessionRecord.title
          : typeof info?.title === "string"
            ? info.title
            : null;

      if (!title) {
        return null;
      }

      const parsed = parseMissionTitle(title);
      if (!parsed.agentId) {
        return null;
      }

      return {
        agentId: parsed.agentId,
        missionId: parsed.missionId,
        title,
      };
    }
  } catch {
    return null;
  }

  return null;
}

async function resolveOwnerFromMissionStore(
  $: unknown,
  sessionId: string
): Promise<{ agentId: OwnerAgent; missionId: string | null } | null> {
  const shell = $ as (strings: TemplateStringsArray, ...values: unknown[]) => {
    quiet(): Promise<{ text(): string }>;
  };

  try {
    const result = await shell`
      python3 ${RESOLVE_SESSION_OWNER_SCRIPT} ${sessionId}
    `.quiet();
    const text = result.text().trim();
    if (!text) {
      return null;
    }

    const parsed = JSON.parse(text) as { agentId?: unknown; missionId?: unknown };
    if (
      parsed.agentId === "noctis" ||
      parsed.agentId === "ignis" ||
      parsed.agentId === "gladiolus" ||
      parsed.agentId === "prompto"
    ) {
      return {
        agentId: parsed.agentId,
        missionId: typeof parsed.missionId === "string" ? parsed.missionId : null,
      };
    }
  } catch {
    return null;
  }

  return null;
}

async function resolveOwner(
  $: unknown,
  client: unknown,
  sessionId: string
): Promise<OwnerResolution | null> {
  const fromTitle = await resolveOwnerFromSessionTitle(client, sessionId);
  const fromStore = await resolveOwnerFromMissionStore($, sessionId);

  if (fromTitle && fromStore) {
    return {
      agentId: fromStore.agentId,
      missionId: fromStore.missionId ?? fromTitle.missionId,
      source: "session-title+mission-store",
      title: fromTitle.title,
      mismatch:
        fromTitle.agentId !== fromStore.agentId ||
        (fromTitle.missionId !== null && fromStore.missionId !== null && fromTitle.missionId !== fromStore.missionId),
    };
  }

  if (fromStore) {
    return {
      agentId: fromStore.agentId,
      missionId: fromStore.missionId,
      source: "mission-store",
      title: fromTitle?.title ?? null,
      mismatch: false,
    };
  }

  if (fromTitle) {
    return {
      agentId: fromTitle.agentId,
      missionId: fromTitle.missionId,
      source: "session-title",
      title: fromTitle.title,
      mismatch: false,
    };
  }

  return null;
}

async function fetchLatestAssistantMessage(client: unknown, sessionId: string): Promise<string | null> {
  const clientRecord = asRecord(client);
  const sessionApi = asRecord(clientRecord?.session);
  const messagesFn = sessionApi?.messages;

  if (typeof messagesFn !== "function") {
    return null;
  }

  try {
    const result = await (messagesFn as (input: unknown) => Promise<unknown>)({ path: { id: sessionId } });
    const resultRecord = asRecord(result);
    const messages = Array.isArray(resultRecord?.data) ? resultRecord.data : [];

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = asRecord(messages[i]);
      const info = asRecord(message?.info);
      const role = typeof info?.role === "string" ? info.role : null;
      if (role !== "assistant") {
        continue;
      }

      const parts = Array.isArray(message?.parts) ? message.parts : [];
      const text = parts
        .map((part) => {
          const partRecord = asRecord(part);
          return partRecord?.type === "text" && typeof partRecord.text === "string"
            ? partRecord.text
            : "";
        })
        .filter((value) => value.trim().length > 0)
        .join("\n\n");

      const normalized = normalizeContent(text);
      if (normalized) {
        return normalized;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function appendLine(
  $: unknown,
  path: string,
  line: string
): Promise<void> {
  const shell = $ as (strings: TemplateStringsArray, ...values: unknown[]) => {
    quiet(): Promise<unknown>;
  };
  await shell`mkdir -p logs`.quiet();
  await shell`printf '%s\n' ${line} >> ${path}`.quiet();
}

const SessionIdleOwnershipProbe: Plugin = async ({ $, client }) => {
  const diagPath = "logs/session-idle-ownership-probe.log";
  const jsonlPath = "logs/session-idle-ownership-probe.jsonl";
  const recentIdleAt = new Map<string, number>();
  const cooldownMs = 2_000;

  await appendLine($, diagPath, `[${new Date().toISOString()}] session-idle-ownership-probe started`);

  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") {
        return;
      }

      const eventRecord = asRecord(event as unknown);
      if (!eventRecord) {
        return;
      }

      const sessionId = extractSessionId(eventRecord);
      if (!sessionId) {
        await appendLine($, diagPath, `[${new Date().toISOString()}] session.idle ignored: no session id`);
        return;
      }

      const now = Date.now();
      const lastSeenAt = recentIdleAt.get(sessionId) ?? 0;
      if (now - lastSeenAt < cooldownMs) {
        return;
      }
      recentIdleAt.set(sessionId, now);

      const owner = await resolveOwner($, client, sessionId);
      const latestMessage = await fetchLatestAssistantMessage(client, sessionId);

      const record: ProbeRecord = {
        timestamp: new Date().toISOString(),
        eventType: "session.idle",
        sessionId,
        missionId: owner?.missionId ?? null,
        ownerAgent: owner?.agentId ?? null,
        resolutionSource: owner?.source ?? null,
        sessionTitle: owner?.title ?? null,
        mismatch: owner?.mismatch ?? false,
        message: latestMessage,
      };

      await appendLine($, jsonlPath, JSON.stringify(record));

      const ownerLabel = record.ownerAgent ?? "unresolved";
      const messagePreview = latestMessage
        ? latestMessage.replace(/\s+/g, " ").slice(0, 240)
        : "(no assistant message)";
      await appendLine(
        $,
        `logs/session-idle-ownership-probe-${ownerLabel}.log`,
        `[${record.timestamp}] session=${sessionId} mission=${record.missionId ?? "unknown"} source=${record.resolutionSource ?? "none"} mismatch=${record.mismatch} ${messagePreview}`
      );

      if (!owner) {
        await appendLine($, diagPath, `[${record.timestamp}] unresolved owner for session ${sessionId}`);
        return;
      }

      await appendLine(
        $,
        diagPath,
        `[${record.timestamp}] resolved session ${sessionId} -> ${owner.agentId} via ${owner.source}${owner.mismatch ? " (mismatch)" : ""}`
      );
    },
  };
};

export default SessionIdleOwnershipProbe;