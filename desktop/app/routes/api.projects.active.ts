import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { spawnSync } from "node:child_process";
import { getProjectRoot } from "@/lib/getProjectRoot.server";

/**
 * PUT /api/projects/active
 * Updates active_project_ids in config/current_projects.yaml.
 * Uses yaml_write_flock.sh for atomic, flock-protected writes.
 */
export async function action({ request }: { request: Request }) {
  if (request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const root = getProjectRoot();
    const body = (await request.json()) as {
      activeProjectIds?: unknown;
      currentUpdatedAt?: string;
    };

    if (!Array.isArray(body.activeProjectIds)) {
      return Response.json(
        { error: "activeProjectIds must be an array" },
        { status: 400 }
      );
    }
    const newIds: string[] = body.activeProjectIds;

    // Validate: all IDs must have a corresponding projects/<id>.yaml
    const projectsDir = join(root, "projects");
    const invalidIds = newIds.filter(
      (id) =>
        typeof id !== "string" || !existsSync(join(projectsDir, `${id}.yaml`))
    );
    if (invalidIds.length > 0) {
      return Response.json(
        { error: `Unknown project IDs: ${invalidIds.join(", ")}` },
        { status: 400 }
      );
    }

    // Read current config for conflict detection and audit log
    const configPath = join(root, "config/current_projects.yaml");
    let beforeIds: string[] = [];
    let currentUpdatedAt = "";
    if (existsSync(configPath)) {
      try {
        const raw = readFileSync(configPath, "utf-8");
        const parsed = parseYaml(raw);
        beforeIds = Array.isArray(parsed?.active_project_ids)
          ? parsed.active_project_ids
          : [];
        currentUpdatedAt = parsed?.updated_at ?? "";
      } catch {
        // Ignore parse errors; treat as empty
      }
    }

    // Optimistic concurrency: reject if config was modified since client last read
    if (
      body.currentUpdatedAt &&
      currentUpdatedAt &&
      body.currentUpdatedAt !== currentUpdatedAt
    ) {
      return Response.json(
        {
          error:
            "Conflict: config was modified by another process. Please reload.",
        },
        { status: 409 }
      );
    }

    // Build YAML content
    const now = new Date().toISOString();
    const idsBlock =
      newIds.length === 0
        ? "active_project_ids: []\n"
        : "active_project_ids:\n" +
          newIds.map((id) => `  - "${id}"`).join("\n") +
          "\n";
    const content = `${idsBlock}updated_at: "${now}"\nupdated_by: "desktop-app"\n`;

    // Atomic write via yaml_write_flock.sh
    const result = spawnSync(
      join(root, "scripts/yaml_write_flock.sh"),
      [configPath, content],
      { encoding: "utf-8" }
    );

    if (result.status !== 0) {
      return Response.json(
        {
          error: `Write failed: ${result.stderr || result.error?.message || "unknown error"}`,
        },
        { status: 500 }
      );
    }

    // Structured audit log
    console.log(
      JSON.stringify({
        event: "active_projects_changed",
        before: beforeIds,
        after: newIds,
        at: now,
        by: "desktop-app",
      })
    );

    return Response.json({ success: true, activeProjectIds: newIds, updatedAt: now });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
