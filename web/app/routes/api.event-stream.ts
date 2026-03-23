import { getOpencodeClient } from "@/lib/opencode-client";
import type { Route } from "./+types/api.event-stream";

export const loader = async ({ request }: Route.LoaderArgs) => {
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
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
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
        for await (const event of stream) {
          if (abortController.signal.aborted) {
            break;
          }
          const payload = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
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
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
