import { restartTmuxTransport } from "@/lib/tmux-transport-control.server";
import type { Route } from "./+types/api.tmux-transport";

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const transportStatus = await restartTmuxTransport();
    return Response.json({ success: true as const, transportStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: message },
      {
        status: message.includes("transport_mode=tmux-resident") ? 409 : 500,
      },
    );
  }
};