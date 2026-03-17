import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  readRegisteredProjects,
  readScopedProjectsConfig,
} from "@/lib/project-config.server";

/**
 * GET /api/projects
 * Returns all registered projects and current active project IDs by scope.
 */
export function loader() {
  try {
    const root = getProjectRoot();
    const { configUpdatedAt, projectScopes } = readScopedProjectsConfig(root);
    const projects = readRegisteredProjects(root);

    return Response.json({ projectScopes, configUpdatedAt, projects });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
