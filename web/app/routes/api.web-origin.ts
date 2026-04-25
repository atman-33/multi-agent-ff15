import { getWebServerStatus } from "@/lib/web-server";

export const loader = async () => {
  const envOrigin = process.env.FF15_WEB_ORIGIN?.trim();
  if (envOrigin) {
    return Response.json({ origin: envOrigin, source: "env" as const });
  }

  const status = await getWebServerStatus();
  if (status.state === "running" && status.url) {
    return Response.json({ origin: status.url, source: "runtime" as const });
  }

  return Response.json({ error: "Web server origin is unavailable" }, { status: 503 });
};
