import type { ActionFunctionArgs } from "react-router";
import { readMcpConfig, writeMcpServerEnabled } from "@/lib/mcp-config.server";

export const loader = () => {
  const { config, error } = readMcpConfig();
  if (error) {
    return Response.json({ error }, { status: 500 });
  }
  return Response.json({ config });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { name, enabled } = body as { enabled: boolean; name: string };

    if (typeof name !== "string" || typeof enabled !== "boolean") {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const result = writeMcpServerEnabled(name, enabled);
    if ("error" in result) {
      const message = result.error ?? "Failed to update MCP server";
      return Response.json(
        { error: message },
        { status: message.includes("not found") ? 404 : 500 }
      );
    }

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
};
