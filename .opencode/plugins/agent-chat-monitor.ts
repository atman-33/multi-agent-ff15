import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

interface ChatLogRecord {
  agent: string;
  content?: string;
  data?: Record<string, unknown>;
  id: string;
  item_id?: string;
  kind: string;
  message_id?: string;
  meta: {
    event: string;
    pane: string;
  };
  schema_version?: number;
  session_id: string;
  source: string;
  state?: string;
  title?: string;
  ts: string;
  turn_id?: string;
}

function normalizeContent(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeToolState(value: string | undefined): string {
  if (value === "pending") {
    return "pending";
  }
  if (value === "completed") {
    return "completed";
  }
  if (value === "error") {
    return "failed";
  }
  return "running";
}

function getToolResult(output: unknown): string | null {
  if (typeof output === "string") {
    return normalizeContent(output);
  }

  const record = asRecord(output);
  if (!record) {
    return null;
  }

  if (typeof record.text === "string") {
    return normalizeContent(record.text);
  }

  return null;
}

function isPlanTool(toolName: string | undefined, input: Record<string, unknown>): boolean {
  if (toolName === "manage_todo_list" || toolName === "todowrite") {
    return true;
  }
  return Array.isArray(input.todoList) || Array.isArray(input.todos);
}

function getPane(agentId: string): string {
  const paneMap: Record<string, string> = {
    noctis: "0",
    lunafreya: "1",
    ignis: "2",
    gladiolus: "3",
    prompto: "4",
    iris: "5",
  };
  return paneMap[agentId] ?? "0";
}

function extractSessionId(event: Record<string, unknown>): string | null {
  const props = asRecord(event.properties);
  const candidates = [
    event.session_id,
    event.sessionID,
    event.sessionId,
    event.id,
    props?.session_id,
    props?.sessionID,
    props?.sessionId,
    props?.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

async function rotateIfNeeded($: any, logPath: string): Promise<void> {
  const maxLogSizeBytes = 10 * 1024 * 1024;
  const maxLogGenerations = 5;

  try {
    const sizeStr = await $`wc -c < ${logPath} 2>/dev/null || echo 0`.text();
    const size = Number.parseInt(sizeStr.trim(), 10);
    if (size < maxLogSizeBytes) {
      return;
    }

    await $`rm -f ${logPath}.${maxLogGenerations}`.quiet();
    for (let i = maxLogGenerations - 1; i >= 1; i -= 1) {
      await $`mv -f ${logPath}.${i} ${logPath}.${i + 1} 2>/dev/null || true`.quiet();
    }
    await $`mv -f ${logPath} ${logPath}.1`.quiet();
  } catch {
    // ignore rotation errors
  }
}

async function appendJsonlRecord($: any, logPath: string, record: ChatLogRecord): Promise<void> {
  const logDir = logPath.substring(0, logPath.lastIndexOf("/"));
  let tmpPath = "";

  try {
    await $`mkdir -p ${logDir}`.quiet();
    await rotateIfNeeded($, logPath);

    const line = JSON.stringify(record);
    tmpPath = `${logDir}/.chatlog_tmp_${generateId()}`;
    await $`printf '%s\n' ${line} > ${tmpPath}`.quiet();
    await $`flock -x -w 5 ${logPath + ".lock"} cat ${tmpPath} >> ${logPath}`.quiet();
  } catch (err) {
    try {
      const ts = new Date().toISOString();
      await $`mkdir -p ${logDir}`.quiet();
      await $`printf '%s\n' ${`[${ts}] agent-chat-monitor JSONL write ERROR: ${err}`} >> ${logDir + "/agent-chat-monitor-warn.log"}`.quiet();
    } catch {
      // ignore nested logging failures
    }
  } finally {
    if (tmpPath) {
      try {
        await $`rm -f ${tmpPath}`.quiet();
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

const AgentChatMonitor: Plugin = async ({ $, client }) => {
  const agentId = process.env.AGENT_ID;
  const knownAgents = ["noctis", "lunafreya", "ignis", "gladiolus", "prompto", "iris"];

  if (!agentId || !knownAgents.includes(agentId)) {
    return {};
  }

  const jsonlLogPath = "runtime/logs/agent-chat-monitor.jsonl";
  const diagLogPath = "logs/agent-chat-monitor-diag.log";
  const pane = getPane(agentId);

  let currentSessionId: string | null = null;
  let currentTurnId: string | null = null;
  let currentMessageId: string | null = null;
  let turnCounter = 0;
  const textSnapshots = new Map<string, string>();
  const activeTools = new Map<
    string,
    {
      input: Record<string, unknown>;
      kind: "plan" | "tool";
      signature: string;
      state: string;
      title: string;
    }
  >();

  const diagLog = async (message: string): Promise<void> => {
    try {
      const ts = new Date().toISOString();
      await $`mkdir -p logs`.quiet();
      await $`printf '%s\n' ${`[${ts}][${agentId}] ${message}`} >> ${diagLogPath}`.quiet();
    } catch {
      // ignore diag failures
    }
  };

  const log = async (message: string): Promise<void> => {
    try {
      const ts = new Date().toISOString();
      await $`printf '%s\n' ${`[${ts}] agent-chat-monitor (${agentId}): ${message}`} >> logs/agent-chat-monitor.log`.quiet();
    } catch {
      // ignore log failures
    }
  };

  const writeRecord = async (
    record: Omit<ChatLogRecord, "agent" | "id" | "meta" | "session_id" | "source" | "ts">
  ): Promise<void> => {
    await appendJsonlRecord($, jsonlLogPath, {
      agent: agentId,
      id: generateId(),
      meta: {
        event: "agent_event",
        pane,
      },
      schema_version: 2,
      session_id: currentSessionId ?? "unknown",
      source: "event_stream",
      ts: new Date().toISOString(),
      ...record,
    });
  };

  const ensureTurn = async (): Promise<string | null> => {
    if (!currentSessionId) {
      try {
        const sessionsResult = await client.session.list();
        if (sessionsResult?.data && Array.isArray(sessionsResult.data) && sessionsResult.data.length > 0) {
          currentSessionId = sessionsResult.data[0].id;
        }
      } catch {
        // ignore session list failures
      }
    }

    if (!currentSessionId) {
      return null;
    }

    if (currentTurnId) {
      return currentTurnId;
    }

    turnCounter += 1;
    currentTurnId = `${currentSessionId}:turn:${turnCounter}`;
    await writeRecord({
      item_id: currentTurnId,
      kind: "turn",
      state: "started",
      turn_id: currentTurnId,
    });
    return currentTurnId;
  };

  const finalizeTurn = async (state: "completed" | "interrupted"): Promise<void> => {
    if (!currentTurnId) {
      return;
    }

    for (const [toolUseId, tool] of activeTools.entries()) {
      if (tool.state === "completed" || tool.state === "failed" || tool.state === "interrupted") {
        continue;
      }

      await writeRecord({
        data: {
          input: tool.input,
        },
        item_id: toolUseId,
        kind: tool.kind,
        message_id: currentMessageId ?? undefined,
        state: "interrupted",
        title: tool.title,
        turn_id: currentTurnId,
      });
    }

    await writeRecord({
      item_id: currentTurnId,
      kind: "turn",
      state,
      turn_id: currentTurnId,
    });

    currentTurnId = null;
    currentMessageId = null;
    textSnapshots.clear();
    activeTools.clear();
  };

  await log("agent-chat-monitor started");

  return {
    event: async ({ event }) => {
      const eventAny = event as Record<string, unknown>;
      const extractedSessionId = extractSessionId(eventAny);
      if (extractedSessionId) {
        currentSessionId = extractedSessionId;
      }

      try {
        if (event.type === "session.created") {
          await log(`Captured session ID: ${currentSessionId ?? "unknown"}`);
          return;
        }

        if (event.type === "message.updated") {
          const props = asRecord(eventAny.properties);
          const info = asRecord(props?.info);
          if (info?.role === "assistant" && typeof info.id === "string") {
            currentMessageId = info.id;
          }
          return;
        }

        if (event.type === "message.part.updated") {
          const props = asRecord(eventAny.properties);
          const part = asRecord(props?.part);
          if (!part) {
            return;
          }

          const turnId = await ensureTurn();
          if (!turnId) {
            await diagLog("Skipping part update because no session/turn could be resolved");
            return;
          }

          if (part.type === "text" && typeof part.text === "string") {
            const text = normalizeContent(part.text);
            if (!text) {
              return;
            }

            const itemId = typeof part.id === "string"
              ? part.id
              : currentMessageId ?? `text-${generateId()}`;
            if (textSnapshots.get(itemId) === text) {
              return;
            }

            textSnapshots.set(itemId, text);
            await writeRecord({
              content: text,
              item_id: itemId,
              kind: "assistant_text",
              message_id: currentMessageId ?? undefined,
              turn_id: turnId,
            });
            return;
          }

          if (part.type === "tool" && typeof part.tool === "string") {
            const stateRecord = asRecord(part.state);
            const input = asRecord(stateRecord?.input) ?? {};
            const toolState = normalizeToolState(
              typeof stateRecord?.status === "string"
                ? (stateRecord.status as string)
                : undefined
            );
            const itemId = typeof part.id === "string"
              ? part.id
              : `tool-${generateId()}`;
            const result = getToolResult(stateRecord?.output);
            const kind = isPlanTool(part.tool, input) ? "plan" : "tool";
            const data: Record<string, unknown> = {
              input,
            };
            if (result) {
              data.result = result;
            }
            if (typeof stateRecord?.error === "string") {
              data.error = stateRecord.error as string;
            }
            if (Array.isArray(input.todoList)) {
              data.todoList = input.todoList;
            }

            const signature = JSON.stringify({
              data,
              kind,
              state: toolState,
              title: part.tool,
            });
            const previous = activeTools.get(itemId);
            if (previous?.signature === signature) {
              return;
            }

            activeTools.set(itemId, {
              input,
              kind,
              signature,
              state: toolState,
              title: part.tool,
            });

            await writeRecord({
              data,
              item_id: itemId,
              kind,
              message_id: currentMessageId ?? undefined,
              state: toolState,
              title: part.tool,
              turn_id: turnId,
            });
            return;
          }

          return;
        }

        if (event.type === "session.error") {
          await writeRecord({
            content: "Session error encountered.",
            kind: "status",
            state: "error",
            turn_id: currentTurnId ?? undefined,
          });
          await finalizeTurn("interrupted");
          return;
        }

        if (event.type === "session.idle") {
          await finalizeTurn("completed");
        }
      } catch (error) {
        await diagLog(`ERROR in agent-chat-monitor: ${String(error)}`);
        await log(`Error in event handler: ${String(error)}`);
      }
    },
  };
};

export default AgentChatMonitor;
