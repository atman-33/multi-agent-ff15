import {
  forceRestartOpencodeServer,
  getOpencodeServerStatus,
  recoverOpencodeServer,
} from "@/lib/opencode-server";
import type { Route } from "./+types/api.opencode-server";

type ServerLifecycleAction = "recover" | "force-restart";

export const loader = async () => {
  const status = await getOpencodeServerStatus();
  return Response.json(status);
};

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const requestedAction: ServerLifecycleAction =
    body?.action === "force-restart" ? "force-restart" : "recover";

  try {
    const status =
      requestedAction === "force-restart"
        ? await forceRestartOpencodeServer()
        : await recoverOpencodeServer();

    const responseStatus =
      requestedAction === "force-restart"
        ? status.forceRestart.availability === "blocked"
          ? 500
          : status.forceRestart.availability === "unavailable"
            ? 409
            : 200
        : status.recoveryBlocked
          ? 500
          : 200;

    return Response.json(status, {
      status: responseStatus,
    });
  } catch (error) {
    const status = await getOpencodeServerStatus();
    return Response.json(
      {
        ...status,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
};