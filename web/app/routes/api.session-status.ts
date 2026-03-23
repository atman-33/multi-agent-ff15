import { getOpencodeClient } from "@/lib/opencode-client";

export const loader = async () => {
  try {
    const client = getOpencodeClient();
    const result = await client.session.status();
    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }
    return Response.json({ statuses: result.data ?? {} });
  } catch {
    return Response.json({ statuses: {} }, { status: 503 });
  }
};
