import { getOpencodeClient } from "@/lib/opencode-client";

export const loader = async () => {
  try {
    const client = getOpencodeClient();
    const result = await client.config.providers();

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json(result.data ?? { providers: [], default: {} });
  } catch {
    return Response.json({ providers: [], default: {} }, { status: 503 });
  }
};
