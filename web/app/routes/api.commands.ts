import { getOpencodeClient } from "@/lib/opencode-client";

export const loader = async () => {
  try {
    const client = getOpencodeClient();
    const result = await client.command.list();

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json({ commands: result.data ?? [] });
  } catch {
    return Response.json({ commands: [] }, { status: 503 });
  }
};
