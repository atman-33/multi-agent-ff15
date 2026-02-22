import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getProjectRoot } from "@/lib/getProjectRoot.server";

/**
 * GET /api/projects
 * Returns all registered projects and current active project IDs.
 */
export async function loader() {
  try {
    const root = getProjectRoot();

    // Read active project IDs from current_projects.yaml
    const configPath = join(root, "config/current_projects.yaml");
    let activeProjectIds: string[] = [];
    let configUpdatedAt = "";

    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf-8");
      const parsed = parseYaml(raw);
      activeProjectIds = Array.isArray(parsed?.active_project_ids)
        ? parsed.active_project_ids
        : [];
      configUpdatedAt = parsed?.updated_at ?? "";
    }

    // Read all project entries from projects/*.yaml
    const projectsDir = join(root, "projects");
    const projects: Array<{
      id: string;
      displayName: string;
      path: string;
      updatedAt: string;
    }> = [];

    if (existsSync(projectsDir)) {
      const files = readdirSync(projectsDir).filter(
        (f) => f.endsWith(".yaml") && !f.startsWith(".")
      );
      for (const file of files) {
        try {
          const raw = readFileSync(join(projectsDir, file), "utf-8");
          const parsed = parseYaml(raw);
          if (parsed?.id) {
            projects.push({
              id: parsed.id,
              displayName: parsed.name ?? parsed.id,
              path: parsed.root_path ?? "",
              updatedAt: parsed.updated_at ?? "",
            });
          }
        } catch {
          // Skip malformed project files
        }
      }
    }

    return Response.json({ activeProjectIds, configUpdatedAt, projects });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
