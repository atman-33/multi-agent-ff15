import { getOpencodeClient } from "@/lib/opencode-client";

export const loader = async () => {
  try {
    const client = getOpencodeClient();
    const result = await client.app.agents();

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json({ agents: result.data ?? [] });
  } catch {
    return Response.json({ agents: [] }, { status: 503 });
  }
};
