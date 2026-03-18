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
  messageId?: string;
  source: string;
  turnId?: string;
}

export interface ChatTimelineExecutionItem {
  agent: string;
  firstTs: string;
  input: Record<string, unknown> | null;
  isPlan: boolean;
  key: string;
  lastTs: string;
  messageId?: string;
  result: string | null;
  source: string;
  state: "pending" | "running" | "completed" | "failed" | "interrupted";
  title: string;
  todos: TimelineTodo[];
  toolUseId: string;
  turnId?: string;
}

export interface ChatTimelineLifecycleItem {
  id: string;
  itemId?: string;
  state: string;
  ts: string;
}

export interface ChatTimelineTurnItem {
  agent: string;
  executions: ChatTimelineExecutionItem[];
  firstTs: string;
  key: string;
  lastTs: string;
  lifecycle: ChatTimelineLifecycleItem[];
  messageId?: string;
  primaryMessage: ChatTimelineMessageItem | null;
  source: string;
  statuses: ChatTimelineMessageItem[];
  supportingMessages: ChatTimelineMessageItem[];
  turnId: string;
}

export type ChatTimelineItem =
  | ({ type: "message" } & ChatTimelineMessageItem)
  | ({ type: "execution" } & ChatTimelineExecutionItem)
  | ({ type: "turn" } & ChatTimelineTurnItem);

const NUMERIC_ID_PATTERN = /^\d+$/;

interface TurnBucket {
  agent: string;
  executionMap: Map<string, ChatTimelineExecutionItem>;
  firstTs: string;
  key: string;
  lastTs: string;
  lifecycle: ChatTimelineLifecycleItem[];
  messageId?: string;
  messageMap: Map<string, ChatTimelineMessageItem>;
  source: string;
  statusMap: Map<string, ChatTimelineMessageItem>;
  turnId: string;
}

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

  const input = toRecord(data.input);
  const output = toRecord(data.output);
  const result = toRecord(data.result);
  const candidates = [
    data.todoList,
    data.todos,
    data.items,
    input?.todoList,
    input?.todos,
    input?.items,
    output?.todoList,
    output?.todos,
    output?.items,
    result?.todoList,
    result?.todos,
    result?.items,
  ];
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
            : typeof record.content === "string"
              ? record.content
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

function compareTimelineEntries(
  left: { firstTs: string; key: string },
  right: { firstTs: string; key: string }
): number {
  const diff =
    new Date(left.firstTs).getTime() - new Date(right.firstTs).getTime();
  if (diff !== 0) {
    return diff;
  }
  return left.key.localeCompare(right.key);
}

function isTurnAwareRecord(record: ChatLogRecord): boolean {
  return record.schema_version === 2 && typeof record.turn_id === "string";
}

function createLegacyMessageItem(record: ChatLogRecord): ChatTimelineItem {
  return {
    type: "message",
    agent: record.agent,
    content: record.content ?? "",
    firstTs: record.ts,
    key: `legacy:${record.id}`,
    kind:
      record.kind === "error"
        ? "error"
        : record.kind === "status"
          ? "status"
          : "answer",
    lastTs: record.ts,
    messageId: record.message_id,
    source: record.source,
    turnId: record.turn_id,
  };
}

function createMessageItem(
  record: ChatLogRecord,
  kind: ChatTimelineMessageItem["kind"]
): ChatTimelineMessageItem {
  return {
    agent: record.agent,
    content: record.content ?? "",
    firstTs: record.ts,
    key:
      kind === "status" || kind === "error"
        ? `status:${record.id}`
        : getMessageKey(record),
    kind,
    lastTs: record.ts,
    messageId: record.message_id,
    source: record.source,
    turnId: record.turn_id,
  };
}

function createExecutionItem(
  record: ChatLogRecord,
  data: Record<string, unknown> | null
): ChatTimelineExecutionItem {
  const todos = parseTodos(data);
  const isPlan = isPlanRecord(record, data);
  const nextInput = toRecord(data?.input) ?? data;
  const nextResult =
    typeof data?.result === "string"
      ? data.result
      : typeof record.content === "string"
        ? record.content
        : null;

  return {
    agent: record.agent,
    firstTs: record.ts,
    input: nextInput,
    isPlan,
    key: getExecutionKey(record),
    lastTs: record.ts,
    messageId: record.message_id,
    result: nextResult,
    source: record.source,
    state: toState(record.state),
    title: record.title ?? (isPlan ? "Task Plan" : "Tool"),
    toolUseId: record.item_id ?? record.id,
    todos,
    turnId: record.turn_id,
  };
}

function getOrCreateTurnBucket(
  buckets: Map<string, TurnBucket>,
  record: ChatLogRecord
): TurnBucket {
  const turnId = record.turn_id ?? record.id;
  const existing = buckets.get(turnId);
  if (existing) {
    if (new Date(record.ts).getTime() < new Date(existing.firstTs).getTime()) {
      existing.firstTs = record.ts;
    }
    if (new Date(record.ts).getTime() > new Date(existing.lastTs).getTime()) {
      existing.lastTs = record.ts;
    }
    existing.messageId = record.message_id ?? existing.messageId;
    return existing;
  }

  const created: TurnBucket = {
    agent: record.agent,
    executionMap: new Map(),
    firstTs: record.ts,
    key: `turn:${turnId}`,
    lastTs: record.ts,
    lifecycle: [],
    messageId: record.message_id,
    messageMap: new Map(),
    source: record.source,
    statusMap: new Map(),
    turnId,
  };
  buckets.set(turnId, created);
  return created;
}

function upsertTurnMessage(
  bucket: TurnBucket,
  record: ChatLogRecord,
  kind: ChatTimelineMessageItem["kind"]
): void {
  const key = kind === "answer" ? getMessageKey(record) : `status:${record.id}`;
  const targetMap = kind === "answer" ? bucket.messageMap : bucket.statusMap;
  const existing = targetMap.get(key);

  if (!existing) {
    targetMap.set(key, createMessageItem(record, kind));
    return;
  }

  existing.content = record.content ?? existing.content;
  existing.lastTs = record.ts;
  existing.messageId = record.message_id ?? existing.messageId;
  existing.turnId = record.turn_id ?? existing.turnId;
}

function upsertTurnExecution(
  bucket: TurnBucket,
  record: ChatLogRecord,
  data: Record<string, unknown> | null
): void {
  const key = getExecutionKey(record);
  const existing = bucket.executionMap.get(key);

  if (!existing) {
    bucket.executionMap.set(key, createExecutionItem(record, data));
    return;
  }

  const nextTodos = parseTodos(data);
  const nextInput = toRecord(data?.input) ?? data;
  const nextResult =
    typeof data?.result === "string"
      ? data.result
      : typeof record.content === "string"
        ? record.content
        : null;
  const nextIsPlan = isPlanRecord(record, data);

  existing.input = nextInput ?? existing.input;
  existing.isPlan = nextIsPlan || existing.isPlan;
  existing.lastTs = record.ts;
  existing.messageId = record.message_id ?? existing.messageId;
  existing.result = nextResult ?? existing.result;
  existing.state = toState(record.state);
  existing.title = record.title ?? existing.title;
  existing.todos = nextTodos.length > 0 ? nextTodos : existing.todos;
  existing.turnId = record.turn_id ?? existing.turnId;
}

function appendLifecycle(bucket: TurnBucket, record: ChatLogRecord): void {
  bucket.lifecycle.push({
    id: record.id,
    itemId: record.item_id,
    state: record.state ?? "running",
    ts: record.ts,
  });
}

function buildTurnItem(bucket: TurnBucket): ChatTimelineItem {
  const messages = [...bucket.messageMap.values()].sort(compareTimelineEntries);
  const statuses = [...bucket.statusMap.values()].sort(compareTimelineEntries);
  const executions = [...bucket.executionMap.values()].sort(
    compareTimelineEntries
  );
  const lifecycle = [...bucket.lifecycle].sort((left, right) => {
    const diff = new Date(left.ts).getTime() - new Date(right.ts).getTime();
    if (diff !== 0) {
      return diff;
    }
    return left.id.localeCompare(right.id);
  });
  const primaryMessage =
    [...messages]
      .reverse()
      .find((message) => message.content.trim().length > 0) ??
    messages.at(-1) ??
    null;
  const supportingMessages = messages.filter(
    (message) => message.key !== primaryMessage?.key
  );

  return {
    type: "turn",
    agent: bucket.agent,
    executions,
    firstTs: bucket.firstTs,
    key: bucket.key,
    lastTs: bucket.lastTs,
    lifecycle,
    messageId: primaryMessage?.messageId ?? bucket.messageId,
    primaryMessage,
    source: bucket.source,
    statuses,
    supportingMessages,
    turnId: bucket.turnId,
  };
}

function buildFallbackTimelineItem(
  record: ChatLogRecord,
  messageItems: Map<string, ChatTimelineItem>,
  executionItems: Map<string, ChatTimelineItem>,
  order: string[],
  seenOrder: Set<string>
): void {
  if (record.schema_version !== 2) {
    const item = createLegacyMessageItem(record);
    pushOrder(order, seenOrder, item.key);
    messageItems.set(item.key, item);
    return;
  }

  if (record.kind === "assistant_text") {
    const key = getMessageKey(record);
    const existing = messageItems.get(key);
    if (!existing) {
      const item: ChatTimelineItem = {
        type: "message",
        ...createMessageItem(record, "answer"),
      };
      pushOrder(order, seenOrder, key);
      messageItems.set(key, item);
      return;
    }

    if (existing.type === "message") {
      existing.content = record.content ?? existing.content;
      existing.lastTs = record.ts;
      existing.messageId = record.message_id ?? existing.messageId;
      existing.turnId = record.turn_id ?? existing.turnId;
    }
    return;
  }

  if (record.kind === "status") {
    const item: ChatTimelineItem = {
      type: "message",
      ...createMessageItem(
        record,
        record.state === "error" ? "error" : "status"
      ),
    };
    pushOrder(order, seenOrder, item.key);
    messageItems.set(item.key, item);
    return;
  }

  if (record.kind === "tool" || record.kind === "plan") {
    const key = getExecutionKey(record);
    const data = toRecord(record.data);
    const existing = executionItems.get(key);
    if (!existing) {
      const item: ChatTimelineItem = {
        type: "execution",
        ...createExecutionItem(record, data),
      };
      pushOrder(order, seenOrder, key);
      executionItems.set(key, item);
      return;
    }

    if (existing.type === "execution") {
      upsertTurnExecution(
        {
          agent: existing.agent,
          executionMap: new Map([[key, existing]]),
          firstTs: existing.firstTs,
          key: existing.key,
          lastTs: existing.lastTs,
          lifecycle: [],
          messageMap: new Map(),
          source: existing.source,
          statusMap: new Map(),
          turnId: existing.turnId ?? record.turn_id ?? record.id,
          messageId: existing.messageId,
        },
        record,
        data
      );
    }
  }
}

export function buildChatTimeline(
  records: ChatLogRecord[]
): ChatTimelineItem[] {
  const messageItems = new Map<string, ChatTimelineItem>();
  const executionItems = new Map<string, ChatTimelineItem>();
  const turnItems = new Map<string, ChatTimelineItem>();
  const turnBuckets = new Map<string, TurnBucket>();
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
    if (!isTurnAwareRecord(record)) {
      buildFallbackTimelineItem(
        record,
        messageItems,
        executionItems,
        order,
        seenOrder
      );
      continue;
    }

    const bucket = getOrCreateTurnBucket(turnBuckets, record);
    pushOrder(order, seenOrder, bucket.key);

    if (record.kind === "assistant_text") {
      upsertTurnMessage(bucket, record, "answer");
      continue;
    }

    if (record.kind === "status") {
      upsertTurnMessage(
        bucket,
        record,
        record.state === "error" ? "error" : "status"
      );
      continue;
    }

    if (record.kind === "tool" || record.kind === "plan") {
      upsertTurnExecution(bucket, record, toRecord(record.data));
      continue;
    }

    if (record.kind === "turn") {
      appendLifecycle(bucket, record);
      continue;
    }

    buildFallbackTimelineItem(
      record,
      messageItems,
      executionItems,
      order,
      seenOrder
    );
  }

  for (const bucket of turnBuckets.values()) {
    const turnItem = buildTurnItem(bucket);
    turnItems.set(turnItem.key, turnItem);
  }

  return order
    .map(
      (key) =>
        turnItems.get(key) ?? messageItems.get(key) ?? executionItems.get(key)
    )
    .filter((item): item is ChatTimelineItem => item !== undefined);
}
