import { getOpencodeClient } from "@/lib/opencode-client";
import { listSessionStatusTargets } from "@/lib/session-owner-routing.server";

export const loader = async () => {
  try {
    const targets = listSessionStatusTargets();
    if (targets.length > 0) {
      const statuses: Record<string, unknown> = {};
      let successCount = 0;

      for (const target of targets) {
        try {
          const result = await target.client.session.status();
          if (result.error) {
            continue;
          }

          Object.assign(statuses, result.data ?? {});
          successCount += 1;
        } catch {}
      }

      if (successCount > 0) {
        return Response.json({ statuses });
      }

      return Response.json({ statuses: {} }, { status: 503 });
    }

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
