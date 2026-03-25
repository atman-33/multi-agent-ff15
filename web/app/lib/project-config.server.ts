import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { PROJECT_SCOPES, type ProjectScope } from "@/lib/project-scopes";
import { ensureRequiredWebConfigFiles } from "@/lib/required-config.server";

export interface ProjectInstructionFile {
  enabled: boolean;
  path: string;
}

export interface RegisteredProjectDefinition {
  id: string;
  instructionFiles: ProjectInstructionFile[];
  name: string;
  rootPath: string;
  serenaProject: string;
}

export interface ProjectEntry {
  branchName?: string;
  displayName: string;
  id: string;
  path: string;
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
  ensureRequiredWebConfigFiles(root);
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

export function getProjectDefinitionPath(root: string, id: string): string {
  return join(root, "projects", id, "project.yaml");
}

export function readRegisteredProjects(root: string): ProjectEntry[] {
  const projectsDir = join(root, "projects");
  const projects: ProjectEntry[] = [];

  if (!existsSync(projectsDir)) {
    return projects;
  }

  const directories = readdirSync(projectsDir, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith(".")
  );

  for (const directory of directories) {
    try {
      const raw = readFileSync(join(projectsDir, directory.name, "project.yaml"), "utf-8");
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
  const projectPath = getProjectDefinitionPath(root, id);

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
            path: typeof file.path === "string" ? file.path : "",
            enabled: file.enabled !== false,
          }))
      : [];

    return {
      id: parsed.id,
      name: typeof parsed.name === "string" ? parsed.name : parsed.id,
      rootPath: typeof parsed.root_path === "string" ? parsed.root_path : "",
      serenaProject: typeof parsed.serena_project === "string" ? parsed.serena_project : "",
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

  for (const id of activeProjectIds) {
    const projectPath = getProjectDefinitionPath(appRoot, id);
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
