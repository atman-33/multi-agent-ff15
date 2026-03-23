import { getOpencodeServerStatus, recoverOpencodeServer } from "@/lib/opencode-server";
import type { Route } from "./+types/api.opencode.server";

export const loader = async () => {
  const status = await getOpencodeServerStatus();
  return Response.json(status);
};

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const status = await recoverOpencodeServer();
    return Response.json(status);
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
