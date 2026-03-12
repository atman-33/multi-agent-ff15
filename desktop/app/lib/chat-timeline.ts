export interface ChatLogMeta {
  event: string;
  pane: string;
}

export interface ChatLogRecord {
  agent: string;
  content?: string;
  data?: Record<string, unknown> | null;
  id: string;
  item_id?: string;
  kind: string;
  message_id?: string;
  meta: ChatLogMeta;
  schema_version?: number;
  session_id: string;
  source: string;
  state?: string;
  title?: string;
  ts: string;
  turn_id?: string;
}

export interface TimelineTodo {
  id: number;
  status: string;
  title: string;
}

export interface ChatTimelineMessageItem {
  agent: string;
  content: string;
  firstTs: string;
  key: string;
  kind: "answer" | "status" | "error";
  lastTs: string;
  source: string;
}

export interface ChatTimelineExecutionItem {
  agent: string;
  firstTs: string;
  input: Record<string, unknown> | null;
  isPlan: boolean;
  key: string;
  lastTs: string;
  result: string | null;
  source: string;
  state: "pending" | "running" | "completed" | "failed" | "interrupted";
  title: string;
  todos: TimelineTodo[];
  toolUseId: string;
}

export type ChatTimelineItem =
  | ({ type: "message" } & ChatTimelineMessageItem)
  | ({ type: "execution" } & ChatTimelineExecutionItem);

const NUMERIC_ID_PATTERN = /^\d+$/;

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return isRecordObject(value) ? value : null;
}

function toState(
  value: string | undefined
): "pending" | "running" | "completed" | "failed" | "interrupted" {
  if (value === "pending") {
    return "pending";
  }
  if (value === "completed" || value === "done" || value === "finished") {
    return "completed";
  }
  if (value === "failed" || value === "error") {
    return "failed";
  }
  if (value === "interrupted" || value === "aborted" || value === "cancelled") {
    return "interrupted";
  }
  return "running";
}

function parseTodos(data: Record<string, unknown> | null): TimelineTodo[] {
  if (!data) {
    return [];
  }

  const candidates = [data.todoList, data.todos, data.items];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    return candidate
      .map((item, index) => {
        const record = toRecord(item);
        if (!record) {
          return null;
        }

        const title =
          typeof record.title === "string"
            ? record.title
            : typeof record.step === "string"
              ? record.step
              : null;

        if (!title) {
          return null;
        }

        const rawId = record.id;
        const id =
          typeof rawId === "number"
            ? rawId
            : typeof rawId === "string" && NUMERIC_ID_PATTERN.test(rawId)
              ? Number.parseInt(rawId, 10)
              : index + 1;

        return {
          id,
          status: typeof record.status === "string" ? record.status : "pending",
          title,
        } satisfies TimelineTodo;
      })
      .filter((item): item is TimelineTodo => item !== null);
  }

  return [];
}

function isPlanRecord(
  record: ChatLogRecord,
  data: Record<string, unknown> | null
): boolean {
  if (record.kind === "plan") {
    return true;
  }
  const title = record.title?.toLowerCase();
  if (title === "manage_todo_list" || title === "todowrite") {
    return true;
  }
  return parseTodos(data).length > 0;
}

function getExecutionKey(record: ChatLogRecord): string {
  return `execution:${record.item_id ?? record.message_id ?? record.id}`;
}

function getMessageKey(record: ChatLogRecord): string {
  return `message:${record.item_id ?? record.message_id ?? record.id}`;
}

function pushOrder(order: string[], seen: Set<string>, key: string): void {
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  order.push(key);
}

export function buildChatTimeline(
  records: ChatLogRecord[]
): ChatTimelineItem[] {
  const messageItems = new Map<string, ChatTimelineItem>();
  const executionItems = new Map<string, ChatTimelineItem>();
  const seenOrder = new Set<string>();
  const order: string[] = [];
  const sortedRecords = [...records].sort((left, right) => {
    const diff = new Date(left.ts).getTime() - new Date(right.ts).getTime();
    if (diff !== 0) {
      return diff;
    }
    return left.id.localeCompare(right.id);
  });

  for (const record of sortedRecords) {
    const data = toRecord(record.data);

    if (record.schema_version !== 2) {
      const key = `legacy:${record.id}`;
      pushOrder(order, seenOrder, key);
      messageItems.set(key, {
        type: "message",
        agent: record.agent,
        content: record.content ?? "",
        firstTs: record.ts,
        key,
        kind:
          record.kind === "error"
            ? "error"
            : record.kind === "status"
              ? "status"
              : "answer",
        lastTs: record.ts,
        source: record.source,
      });
      continue;
    }

    if (record.kind === "assistant_text") {
      const key = getMessageKey(record);
      const existing = messageItems.get(key);
      if (!existing) {
        pushOrder(order, seenOrder, key);
        messageItems.set(key, {
          type: "message",
          agent: record.agent,
          content: record.content ?? "",
          firstTs: record.ts,
          key,
          kind: "answer",
          lastTs: record.ts,
          source: record.source,
        });
        continue;
      }

      if (existing.type === "message") {
        existing.content = record.content ?? existing.content;
        existing.lastTs = record.ts;
      }
      continue;
    }

    if (record.kind === "status") {
      const key = `status:${record.id}`;
      pushOrder(order, seenOrder, key);
      messageItems.set(key, {
        type: "message",
        agent: record.agent,
        content: record.content ?? "",
        firstTs: record.ts,
        key,
        kind: record.state === "error" ? "error" : "status",
        lastTs: record.ts,
        source: record.source,
      });
      continue;
    }

    if (record.kind === "tool" || record.kind === "plan") {
      const key = getExecutionKey(record);
      const todos = parseTodos(data);
      const isPlan = isPlanRecord(record, data);
      const nextInput = toRecord(data?.input) ?? data;
      const nextResult =
        typeof data?.result === "string"
          ? data.result
          : typeof record.content === "string"
            ? record.content
            : null;
      const existing = executionItems.get(key);

      if (!existing) {
        pushOrder(order, seenOrder, key);
        executionItems.set(key, {
          type: "execution",
          agent: record.agent,
          firstTs: record.ts,
          input: nextInput,
          isPlan,
          key,
          lastTs: record.ts,
          result: nextResult,
          source: record.source,
          state: toState(record.state),
          title: record.title ?? (isPlan ? "Task Plan" : "Tool"),
          toolUseId: record.item_id ?? record.id,
          todos,
        });
        continue;
      }

      if (existing.type === "execution") {
        existing.input = nextInput ?? existing.input;
        existing.isPlan = isPlan || existing.isPlan;
        existing.lastTs = record.ts;
        existing.result = nextResult ?? existing.result;
        existing.state = toState(record.state);
        existing.title = record.title ?? existing.title;
        existing.todos = todos.length > 0 ? todos : existing.todos;
      }
    }
  }

  return order
    .map((key) => messageItems.get(key) ?? executionItems.get(key))
    .filter((item): item is ChatTimelineItem => item !== undefined);
}
