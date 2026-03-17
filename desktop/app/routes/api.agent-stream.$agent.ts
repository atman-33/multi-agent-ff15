import type { LoaderFunctionArgs } from "react-router";
import type { ChatLogRecord } from "@/lib/chat-timeline";
import { getClientForAgent } from "@/lib/opencode-client.server";

function createId(agent: string, sequence: number): string {
  return `${agent}-live-${Date.now()}-${sequence}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeState(value: string | undefined): string {
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
    return output;
  }
  const record = asRecord(output);
  if (!record) {
    return null;
  }
  if (typeof record.text === "string") {
    return record.text;
  }
  return null;
}

function isPlanTool(
  toolName: string | undefined,
  input: Record<string, unknown>
): boolean {
  if (toolName === "manage_todo_list" || toolName === "todowrite") {
    return true;
  }
  return Array.isArray(input.todoList) || Array.isArray(input.todos);
}

function createBaseRecord(
  agent: string,
  sequence: number,
  kind: string,
  sessionId: string | null,
  turnId: string | null,
  itemId?: string,
  messageId?: string
): ChatLogRecord {
  return {
    agent,
    id: createId(agent, sequence),
    item_id: itemId,
    kind,
    message_id: messageId,
    meta: {
      event: "agent_stream",
      pane: "stream",
    },
    schema_version: 2,
    session_id: sessionId ?? "stream",
    source: "live_stream",
    ts: new Date().toISOString(),
    turn_id: turnId ?? undefined,
  };
}

/**
 * GET /api/agent-stream/:agent
 *
 * SSE stream that proxies OpenCode's event stream for a given agent.
 * Emits normalized timeline records.
 */
export function loader({ request, params }: LoaderFunctionArgs) {
  const { agent } = params;
  const client = getClientForAgent(agent ?? "");

  if (!client) {
    return new Response("Agent not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let aborted = false;
  let sequence = 0;
  let currentSessionId: string | null = null;
  let currentTurnId: string | null = null;
  let turnCounter = 0;
  let currentMessageId: string | null = null;
  const seenSnapshots = new Map<string, string>();

  const nextSequence = (): number => {
    sequence += 1;
    return sequence;
  };

  const stream = new ReadableStream({
    async start(controller) {
      request.signal.addEventListener("abort", () => {
        aborted = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      const enqueue = (payload: ChatLogRecord) => {
        if (aborted) {
          return;
        }
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
        } catch {
          // controller closed
        }
      };

      const ensureTurn = (): string => {
        if (currentTurnId) {
          return currentTurnId;
        }
        turnCounter += 1;
        currentTurnId = `${currentSessionId ?? "stream"}:turn:${turnCounter}`;
        const recordSequence = nextSequence();
        enqueue({
          ...createBaseRecord(
            agent ?? "agent",
            recordSequence,
            "turn",
            currentSessionId,
            currentTurnId,
            currentTurnId
          ),
          state: "started",
        });
        return currentTurnId;
      };

      const finishTurn = (state: "completed" | "interrupted"): void => {
        if (!currentTurnId) {
          return;
        }
        const recordSequence = nextSequence();
        enqueue({
          ...createBaseRecord(
            agent ?? "agent",
            recordSequence,
            "turn",
            currentSessionId,
            currentTurnId,
            currentTurnId
          ),
          state,
        });
        currentTurnId = null;
        currentMessageId = null;
        seenSnapshots.clear();
      };

      try {
        const { stream: eventStream } = await client.event.subscribe();

        for await (const event of eventStream) {
          if (aborted) {
            break;
          }

          const e = event as {
            type: string;
            properties?: {
              info?: {
                id?: string;
                role?: string;
              };
              part?: {
                id?: string;
                type?: string;
                text?: string;
                tool?: string;
                state?: {
                  error?: string;
                  output?: unknown;
                  status?: string;
                  input?: Record<string, unknown>;
                };
              };
              status?: { type?: string };
            };
          };

          if (e.type === "session.created") {
            const props = e.properties as
              | { sessionID?: string; sessionId?: string; id?: string }
              | undefined;
            currentSessionId =
              props?.sessionID ??
              props?.sessionId ??
              props?.id ??
              currentSessionId;
            continue;
          }

          if (e.type === "message.updated") {
            const info = e.properties?.info;
            if (info?.role === "assistant" && typeof info.id === "string") {
              currentMessageId = info.id;
            }
            continue;
          }

          if (e.type === "message.part.updated") {
            const part = e.properties?.part;
            if (!part) {
              continue;
            }

            const turnId = ensureTurn();

            if (part.type === "text" && typeof part.text === "string") {
              const snapshot = part.text.trim();
              const itemId =
                part.id ?? currentMessageId ?? `text-${sequence + 1}`;
              if (!snapshot) {
                continue;
              }
              if (seenSnapshots.get(itemId) === snapshot) {
                continue;
              }
              seenSnapshots.set(itemId, snapshot);
              const recordSequence = nextSequence();
              enqueue({
                ...createBaseRecord(
                  agent ?? "agent",
                  recordSequence,
                  "assistant_text",
                  currentSessionId,
                  turnId,
                  itemId,
                  currentMessageId ?? undefined
                ),
                content: snapshot,
              });
              continue;
            }

            if (part.type === "tool" && part.tool) {
              const input = part.state?.input ?? {};
              const toolState = normalizeState(part.state?.status);
              const toolUseId = part.id ?? `tool-${sequence + 1}`;
              const isPlan = isPlanTool(part.tool, input);
              const recordSequence = nextSequence();
              enqueue({
                ...createBaseRecord(
                  agent ?? "agent",
                  recordSequence,
                  isPlan ? "plan" : "tool",
                  currentSessionId,
                  turnId,
                  toolUseId,
                  currentMessageId ?? undefined
                ),
                data: {
                  input,
                  result: getToolResult(part.state?.output),
                  todoList: Array.isArray(
                    (input as Record<string, unknown>).todoList
                  )
                    ? (input as Record<string, unknown>).todoList
                    : undefined,
                },
                state: toolState,
                title: part.tool,
              });
              continue;
            }
          }

          if (e.type === "session.error") {
            finishTurn("interrupted");
            continue;
          }

          if (e.type === "session.idle" || e.type === "session.status") {
            const sessionEvent = e as {
              type: string;
              properties?: { status?: { type?: string } };
            };
            const statusType = sessionEvent.properties?.status?.type;
            if (!statusType || statusType === "idle") {
              finishTurn("completed");
            }
          }
        }
      } catch {
        // stream ended or OpenCode disconnected
      }

      if (!aborted) {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
