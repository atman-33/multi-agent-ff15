import type { Route } from "./+types/api.find-files";
import { getOpencodeClient } from "@/lib/opencode-client";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return Response.json({ files: [] });
  }

  try {
    const client = getOpencodeClient();
    const result = await client.find.files({
      query: {
        query,
        dirs: "false",
      },
    });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json({ files: result.data ?? [] });
  } catch {
    return Response.json({ files: [] }, { status: 503 });
  }
};
