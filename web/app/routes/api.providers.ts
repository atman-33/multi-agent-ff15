import { readOpencodeModelCatalog } from "@/lib/opencode-model-catalog.server";
import { getOpencodeClient } from "@/lib/opencode-client";

export const loader = async () => {
  try {
    const client = getOpencodeClient();
    const [result, catalogResult] = await Promise.all([
      client.config.providers(),
      readOpencodeModelCatalog({ waitForLatest: true }),
    ]);

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    return Response.json({
      ...(result.data ?? { providers: [], default: {} }),
      variantsByModel: catalogResult.snapshot?.variantsByModel ?? {},
      catalog: {
        generatedAt: catalogResult.snapshot?.generatedAt ?? null,
        lastError: catalogResult.lastError,
        refreshState: catalogResult.refreshState,
        stale: catalogResult.stale,
      },
    });
  } catch {
    return Response.json(
      {
        providers: [],
        default: {},
        variantsByModel: {},
        catalog: {
          generatedAt: null,
          lastError: null,
          refreshState: "idle",
          stale: false,
        },
      },
      { status: 503 }
    );
  }
};
