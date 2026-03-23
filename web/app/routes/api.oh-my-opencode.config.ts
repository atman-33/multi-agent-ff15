import type { ActionFunctionArgs } from "react-router";
import {
  readOhMyOpenCodeData,
  writeOhMyOpenCodeConfig,
  type OhMyOpenCodeConfig,
} from "@/lib/oh-my-opencode-config.server";

export const loader = () => {
  return Response.json(readOhMyOpenCodeData());
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    let config: unknown;
    const contentType = request.headers.get("Content-Type");

    if (contentType?.includes("application/json")) {
      const body = (await request.json()) as { config?: unknown };
      config = body.config;
    } else {
      const formData = await request.formData();
      const configValue = formData.get("config");
      if (typeof configValue === "string") {
        config = JSON.parse(configValue);
      }
    }

    if (!config || typeof config !== "object") {
      return Response.json({ error: "Missing config in request body" }, { status: 400 });
    }

    writeOhMyOpenCodeConfig(config as OhMyOpenCodeConfig);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
};
