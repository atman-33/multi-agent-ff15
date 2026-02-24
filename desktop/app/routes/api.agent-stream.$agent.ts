import { getClientForAgent } from "@/lib/opencode-client.server";
import type { LoaderFunctionArgs } from "react-router";

/**
 * Format a tool call into a human-readable activity string.
 * e.g. "bash: echo hello" or "read_file: src/foo.ts"
 */
function formatToolActivity(
  tool: string,
  input: Record<string, unknown>
): string {
  const cmd = input.command ?? input.cmd;
  const filePath =
    input.path ?? input.file_path ?? input.filePath ?? input.filename;

  if (typeof cmd === "string") {
    return `${tool}: ${cmd.slice(0, 80)}`;
  }
  if (typeof filePath === "string") {
    return `${tool}: ${filePath}`;
  }
  const firstVal = Object.values(input)[0];
  if (typeof firstVal === "string") {
    return `${tool}: ${firstVal.slice(0, 80)}`;
  }
  return tool;
}

/**
 * GET /api/agent-stream/:agent
 *
 * SSE stream that proxies OpenCode's event stream for a given agent.
 * Emits JSON events:
 *   { type: "tool", text: "bash: ls -la" }
 *   { type: "text", text: "Analyzing..." }
 *   { type: "idle" }
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { agent } = params;
  const client = getClientForAgent(agent ?? "");

  if (!client) {
    return new Response("Agent not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let aborted = false;

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

      const enqueue = (payload: object) => {
        if (aborted) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
        } catch {
          // controller closed
        }
      };

      try {
        const { stream: eventStream } = await client.event.subscribe();

        for await (const event of eventStream) {
          if (aborted) break;

          // biome-ignore lint/suspicious/noExplicitAny: SDK event types
          const e = event as any;

          if (e.type === "message.part.updated") {
            const part = e.properties?.part;
            if (!part) continue;

            if (part.type === "tool" && part.state?.status === "running") {
              const text = formatToolActivity(
                part.tool,
                part.state.input ?? {}
              );
              enqueue({ type: "tool", text });
            } else if (part.type === "text" && typeof part.text === "string") {
              const snippet = part.text.replace(/\s+/g, " ").slice(-60).trim();
              if (snippet) {
                enqueue({ type: "text", text: snippet });
              }
            }
          } else if (
            e.type === "session.idle" ||
            e.type === "session.status"
          ) {
            const sessionEvent = e as { type: string; properties?: { status?: { type?: string } } };
            const statusType = sessionEvent.properties?.status?.type;
            if (!statusType || statusType === "idle") {
              enqueue({ type: "idle" });
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
