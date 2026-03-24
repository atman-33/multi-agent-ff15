import type { ActionFunctionArgs } from "react-router";
import { readAppConfig, writeAppConfig } from "@/lib/app-config.server";
import { getProjectRoot } from "@/lib/get-project-root.server";

export const loader = () => {
  try {
    const root = getProjectRoot();
    return Response.json({
      config: readAppConfig(root),
      settingsPath: "config/settings.yaml",
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = (await request.json()) as {
      config?: { language?: unknown };
    };

    if (!body.config || typeof body.config !== "object") {
      return Response.json({ error: "Missing config in request body" }, { status: 400 });
    }

    if (typeof body.config.language !== "string" || body.config.language.trim().length === 0) {
      return Response.json({ error: "language must be a non-empty string" }, { status: 400 });
    }

    const root = getProjectRoot();
    const config = writeAppConfig(root, { language: body.config.language });

    return Response.json({
      success: true,
      config,
      settingsPath: "config/settings.yaml",
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
};
