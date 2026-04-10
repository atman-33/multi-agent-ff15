import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { PROJECT_SCOPES, type ProjectScope } from "@/lib/project-scopes";
import { ensureRequiredWebConfigFiles } from "@/lib/required-config.server";

export interface ProjectInstructionFile {
  enabled: boolean;
  path: string;
}

export interface RegisteredProjectDefinition {
  defaultBaseBranch?: string;
  id: string;
  instructionFiles: ProjectInstructionFile[];
  name: string;
  rootPath: string;
  serenaProject: string;
}

export interface ProjectEntry {
  branchName?: string;
  defaultBaseBranch?: string;
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

function resolveManifestPath(projectDefinitionPath: string, filePath: unknown): string {
  if (typeof filePath !== "string" || filePath.length === 0) {
    return "";
  }

  if (isAbsolute(filePath)) {
    return resolve(filePath);
  }

  return resolve(dirname(projectDefinitionPath), filePath);
}

function readProjectDefinitionFile(projectPath: string): RegisteredProjectDefinition | null {
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
            path: resolveManifestPath(projectPath, file.path),
            enabled: file.enabled !== false,
          }))
      : [];

    return {
      ...(typeof parsed.default_base_branch === "string" && parsed.default_base_branch.trim().length > 0
        ? { defaultBaseBranch: parsed.default_base_branch.trim() }
        : {}),
      id: parsed.id,
      name: typeof parsed.name === "string" ? parsed.name : parsed.id,
      rootPath: resolveManifestPath(projectPath, parsed.root_path),
      serenaProject: typeof parsed.serena_project === "string" ? parsed.serena_project : "",
      instructionFiles,
    };
  } catch {
    return null;
  }
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
    const definition = readProjectDefinitionFile(join(projectsDir, directory.name, "project.yaml"));
    if (!definition) {
      continue;
    }

    let branchName = "";
    if (definition.rootPath && existsSync(definition.rootPath)) {
      try {
        branchName = execSync("git branch --show-current", {
          cwd: definition.rootPath,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
      } catch {
        // non-git project root — ignore
      }
    }

    projects.push({
      id: definition.id,
      displayName: definition.name,
      path: definition.rootPath,
      branchName: branchName || undefined,
      ...(definition.defaultBaseBranch ? { defaultBaseBranch: definition.defaultBaseBranch } : {}),
    });
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

  return readProjectDefinitionFile(projectPath);
}

export function getProjectAuthoringDirectory(root: string, id: string): string {
  return dirname(getProjectDefinitionPath(root, id));
}

export function getActiveProjectDefinitionsForScope(
  appRoot: string,
  scope: ProjectScope | null
): RegisteredProjectDefinition[] {
  if (scope === null) {
    return [];
  }

  const { projectScopes } = readScopedProjectsConfig(appRoot);
  const activeProjectIds = projectScopes[scope].activeProjectIds;
  const definitions: RegisteredProjectDefinition[] = [];
  const seen = new Set<string>();

  for (const id of activeProjectIds) {
    if (seen.has(id)) {
      continue;
    }

    const definition = readRegisteredProjectDefinition(appRoot, id);
    if (!definition) {
      continue;
    }

    seen.add(id);
    definitions.push(definition);
  }

  return definitions;
}

export function getActiveProjectRootsForScope(
  appRoot: string,
  scope: ProjectScope | null
): string[] {
  if (scope === null) {
    return [];
  }

  const roots: string[] = [];

  for (const definition of getActiveProjectDefinitionsForScope(appRoot, scope)) {
    if (!definition.rootPath) {
      continue;
    }

    if (existsSync(definition.rootPath)) {
      roots.push(definition.rootPath);
    }
  }

  if (roots.length === 0) {
    roots.push(appRoot);
  }

  return Array.from(new Set(roots));
}
