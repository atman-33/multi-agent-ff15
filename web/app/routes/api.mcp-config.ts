import type { ActionFunctionArgs } from "react-router";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { readMcpConfig, writeMcpServerEnabled } from "@/lib/mcp-config.server";
import { getConfiguredMissionTransportStatus } from "@/lib/tmux-transport-bootstrap.server";

export const loader = async () => {
  const { config, error } = readMcpConfig();
  if (error) {
    return Response.json({ error }, { status: 500 });
  }

  const transportStatus = await getConfiguredMissionTransportStatus(getProjectRoot());
  return Response.json({ config, transportStatus });
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

    const transportStatus = await getConfiguredMissionTransportStatus(getProjectRoot());
    return Response.json({ ...result, transportStatus });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
};
