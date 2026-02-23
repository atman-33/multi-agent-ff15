import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ALLOWED_AGENTS } from "@/lib/agents";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { getAgentEndpoint } from "@/lib/opencode-endpoints.server";

export function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const agent = url.searchParams.get("agent");

  if (!(agent && ALLOWED_AGENTS.includes(agent as any))) {
    return Response.json({ error: "Invalid agent" }, { status: 400 });
  }

  const root = getProjectRoot();
  const getModelScript = join(root, "scripts/get-current-model.sh");

  const result = spawnSync("bash", [getModelScript, agent], {
    cwd: root,
    encoding: "utf-8",
    timeout: 2000,
  });

  if (result.status === 0) {
    return Response.json({ model: result.stdout.trim() });
  }

  const errorMessage = (
    result.stderr ||
    result.stdout ||
    "get-current-model failed"
  ).trim();
  const endpoint = getAgentEndpoint(agent);

  return Response.json(
    {
      error: {
        code: "OPENCODE_UNREACHABLE",
        message: errorMessage || "Agent endpoint is not reachable",
        agent,
        baseUrl: endpoint?.baseUrl,
      },
    },
    { status: 500 }
  );
}
