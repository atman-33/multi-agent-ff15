import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { PROJECT_SCOPES, type ProjectScope } from "@/lib/project-scopes";

export interface ProjectInstructionFile {
  exists: boolean;
  lastCheckedAt: string;
  path: string;
  sha256: string;
  type: string;
}

export interface RegisteredProjectDefinition {
  id: string;
  instructionFiles: ProjectInstructionFile[];
  name: string;
  rootPath: string;
  serenaProject: string;
  updatedAt: string;
}

export interface ProjectEntry {
  branchName?: string;
  displayName: string;
  id: string;
  path: string;
  updatedAt: string;
}

export interface ProjectScopeState {
  activeProjectIds: string[];
}

export interface ScopedProjectsConfig {
  configUpdatedAt: string;
  projectScopes: Record<ProjectScope, ProjectScopeState>;
  updatedBy: string;
}

export function createEmptyProjectScopes(): Record<ProjectScope, ProjectScopeState> {
  return {
    noctis_team: { activeProjectIds: [] },
    lunafreya: { activeProjectIds: [] },
  };
}

export function readScopedProjectsConfig(root: string): ScopedProjectsConfig {
  const configPath = join(root, "config/current_projects.yaml");
  const projectScopes = createEmptyProjectScopes();
  let configUpdatedAt = "";
  let updatedBy = "";

  if (!existsSync(configPath)) {
    return { configUpdatedAt, projectScopes, updatedBy };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parseYaml(raw);
    configUpdatedAt = typeof parsed?.updated_at === "string" ? parsed.updated_at : "";
    updatedBy = typeof parsed?.updated_by === "string" ? parsed.updated_by : "";

    for (const scope of PROJECT_SCOPES) {
      const ids = parsed?.project_scopes?.[scope]?.active_project_ids;
      projectScopes[scope] = {
        activeProjectIds: Array.isArray(ids)
          ? ids.filter((id): id is string => typeof id === "string")
          : [],
      };
    }
  } catch {
    return { configUpdatedAt: "", projectScopes, updatedBy: "" };
  }

  return { configUpdatedAt, projectScopes, updatedBy };
}

function renderScopeYaml(scope: ProjectScope, ids: string[]): string {
  if (ids.length === 0) {
    return `  ${scope}:\n    active_project_ids: []`;
  }

  return [`  ${scope}:`, "    active_project_ids:", ...ids.map((id) => `      - "${id}"`)].join(
    "\n"
  );
}

export function buildScopedProjectsYaml(
  projectScopes: Record<ProjectScope, ProjectScopeState>,
  updatedAt: string,
  updatedBy: string
): string {
  return [
    "project_scopes:",
    renderScopeYaml("noctis_team", projectScopes.noctis_team.activeProjectIds),
    renderScopeYaml("lunafreya", projectScopes.lunafreya.activeProjectIds),
    `updated_at: "${updatedAt}"`,
    `updated_by: "${updatedBy}"`,
    "",
  ].join("\n");
}

export function readRegisteredProjects(root: string): ProjectEntry[] {
  const projectsDir = join(root, "projects");
  const projects: ProjectEntry[] = [];

  if (!existsSync(projectsDir)) {
    return projects;
  }

  const files = readdirSync(projectsDir).filter(
    (file) => file.endsWith(".yaml") && !file.startsWith(".")
  );

  for (const file of files) {
    try {
      const raw = readFileSync(join(projectsDir, file), "utf-8");
      const parsed = parseYaml(raw);
      if (!parsed?.id) {
        continue;
      }

      let branchName = "";
      if (parsed.root_path && existsSync(parsed.root_path)) {
        try {
          branchName = execSync("git branch --show-current", {
            cwd: parsed.root_path,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
          }).trim();
        } catch {
          // non-git project root — ignore
        }
      }

      projects.push({
        id: parsed.id,
        displayName: parsed.name ?? parsed.id,
        path: parsed.root_path ?? "",
        updatedAt: parsed.updated_at ?? "",
        branchName: branchName || undefined,
      });
    } catch {
      // skip malformed project files
    }
  }

  return projects;
}

export function readRegisteredProjectDefinition(
  root: string,
  id: string
): RegisteredProjectDefinition | null {
  const projectPath = join(root, "projects", `${id}.yaml`);

  if (!existsSync(projectPath)) {
    return null;
  }

  try {
    const raw = readFileSync(projectPath, "utf-8");
    const parsed = parseYaml(raw);

    if (!parsed?.id || typeof parsed.id !== "string") {
      return null;
    }

    const instructionFiles = Array.isArray(parsed.instruction_files)
      ? parsed.instruction_files
          .filter(
            (file: unknown): file is Record<string, unknown> => !!file && typeof file === "object"
          )
          .map((file: Record<string, unknown>) => ({
            type: typeof file.type === "string" ? file.type : "unknown",
            path: typeof file.path === "string" ? file.path : "",
            exists: file.exists === true,
            sha256: typeof file.sha256 === "string" ? file.sha256 : "",
            lastCheckedAt: typeof file.last_checked_at === "string" ? file.last_checked_at : "",
          }))
      : [];

    return {
      id: parsed.id,
      name: typeof parsed.name === "string" ? parsed.name : parsed.id,
      rootPath: typeof parsed.root_path === "string" ? parsed.root_path : "",
      serenaProject: typeof parsed.serena_project === "string" ? parsed.serena_project : "",
      updatedAt: typeof parsed.updated_at === "string" ? parsed.updated_at : "",
      instructionFiles,
    };
  } catch {
    return null;
  }
}

export function getActiveProjectRootsForScope(
  appRoot: string,
  scope: ProjectScope | null
): string[] {
  if (scope === null) {
    return [];
  }

  const { projectScopes } = readScopedProjectsConfig(appRoot);
  const activeProjectIds = projectScopes[scope].activeProjectIds;
  const roots: string[] = [];
  const projectsDir = join(appRoot, "projects");

  for (const id of activeProjectIds) {
    const projectPath = join(projectsDir, `${id}.yaml`);
    if (!existsSync(projectPath)) {
      continue;
    }

    try {
      const raw = readFileSync(projectPath, "utf-8");
      const parsed = parseYaml(raw);
      if (parsed?.root_path && existsSync(parsed.root_path)) {
        roots.push(parsed.root_path);
      }
    } catch {
      // ignore malformed project definitions
    }
  }

  if (roots.length === 0) {
    roots.push(appRoot);
  }

  return Array.from(new Set(roots));
}
