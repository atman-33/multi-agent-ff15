import { getOpencodeClient } from "@/lib/opencode-client";
import { unwrapOpencodeEvent } from "@/lib/opencode-event";
import type { Route } from "./+types/api.opencode-sdk-lab.session.$id.events";

function extractSessionId(event: Record<string, unknown>): string | undefined {
  const props = event.properties as Record<string, unknown> | undefined;
  if (!props) {
    return undefined;
  }

  if (typeof props.sessionID === "string") {
    return props.sessionID;
  }

  const part = props.part as Record<string, unknown> | undefined;
  if (part && typeof part.sessionID === "string") {
    return part.sessionID;
  }

  return undefined;
}

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const sessionId = params.id;
  if (!sessionId) {
    return new Response("Missing session id", { status: 400 });
  }

  const encoder = new TextEncoder();

  let stream: AsyncIterable<unknown>;
  try {
    const client = getOpencodeClient();
    const result = await client.global.event();
    stream = result.stream;
  } catch {
    const readable = new ReadableStream({
      start(controller) {
        const payload = JSON.stringify({
          type: "sse.error",
          properties: { message: "OpenCode server not available" },
        });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      },
    });
  }

  const abortController = new AbortController();
  request.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const raw of stream) {
          if (abortController.signal.aborted) {
            break;
          }

          const event = unwrapOpencodeEvent(raw);
          if (!event) {
            continue;
          }

          const eventSessionId = extractSessionId(event as Record<string, unknown>);
          if (eventSessionId !== sessionId) {
            continue;
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (error) {
        const payload = JSON.stringify({
          type: "sse.error",
          properties: { message: String(error) },
        });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      } finally {
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
};