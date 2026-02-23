import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getProjectRoot } from "@/lib/get-project-root.server";

/**
 * GET /api/projects
 * Returns all registered projects and current active project IDs.
 */
export function loader() {
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
      branchName?: string;
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
            let branchName = "";
            if (parsed.root_path && existsSync(parsed.root_path)) {
              try {
                branchName = execSync("git branch --show-current", {
                  cwd: parsed.root_path,
                  encoding: "utf-8",
                  stdio: ["ignore", "pipe", "ignore"],
                }).trim();
              } catch {
                // Not a git repo or git not installed
              }
            }

            projects.push({
              id: parsed.id,
              displayName: parsed.name ?? parsed.id,
              path: parsed.root_path ?? "",
              updatedAt: parsed.updated_at ?? "",
              branchName: branchName || undefined,
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
