import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  buildScopedProjectsYaml,
  createEmptyProjectScopes,
  type ProjectScopeState,
  readScopedProjectsConfig,
} from "@/lib/project-config.server";
import { PROJECT_SCOPES, type ProjectScope } from "@/lib/project-scopes";

export async function action({ request }: { request: Request }) {
  if (request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const root = getProjectRoot();
    const body = (await request.json()) as {
      projectScopes?: Partial<Record<ProjectScope, ProjectScopeState>>;
      currentUpdatedAt?: string;
    };

    if (!body.projectScopes || typeof body.projectScopes !== "object") {
      return Response.json({ error: "projectScopes must be an object" }, { status: 400 });
    }

    const nextProjectScopes = createEmptyProjectScopes();
    for (const scope of PROJECT_SCOPES) {
      const ids = body.projectScopes[scope]?.activeProjectIds;
      if (!Array.isArray(ids)) {
        return Response.json(
          { error: `${scope}.activeProjectIds must be an array` },
          { status: 400 }
        );
      }

      nextProjectScopes[scope] = {
        activeProjectIds: ids.filter((id): id is string => typeof id === "string"),
      };
    }

    const projectsDir = join(root, "projects");
    const allIds = Array.from(
      new Set(PROJECT_SCOPES.flatMap((scope) => nextProjectScopes[scope].activeProjectIds))
    );
    const invalidIds = allIds.filter((id) => !existsSync(join(projectsDir, `${id}.yaml`)));
    if (invalidIds.length > 0) {
      return Response.json(
        { error: `Unknown project IDs: ${invalidIds.join(", ")}` },
        { status: 400 }
      );
    }

    const configPath = join(root, "config/current_projects.yaml");
    const { configUpdatedAt: currentUpdatedAt, projectScopes: beforeProjectScopes } =
      readScopedProjectsConfig(root);

    if (body.currentUpdatedAt && currentUpdatedAt && body.currentUpdatedAt !== currentUpdatedAt) {
      return Response.json(
        {
          error: "Conflict: config was modified by another process. Please reload.",
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const content = buildScopedProjectsYaml(nextProjectScopes, now, "web-app");

    const result = spawnSync(join(root, "scripts/yaml_write_flock.sh"), [configPath, content], {
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      return Response.json(
        {
          error: `Write failed: ${result.stderr || result.error?.message || "unknown error"}`,
        },
        { status: 500 }
      );
    }

    console.log(
      JSON.stringify({
        event: "active_projects_changed",
        before: beforeProjectScopes,
        after: nextProjectScopes,
        at: now,
        by: "web-app",
      })
    );

    return Response.json({
      success: true,
      projectScopes: nextProjectScopes,
      updatedAt: now,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
