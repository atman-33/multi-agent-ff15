import { existsSync } from "node:fs";
import { getMission } from "@/lib/mission-store";
import {
  type RegisteredProjectDefinition,
  readRegisteredProjectDefinition,
  readScopedProjectsConfig,
} from "@/lib/project-config.server";
import {
  getProjectScopeForAgent,
  PROJECT_SCOPES,
  type ProjectScopedAgentId,
} from "@/lib/project-scopes";
import { buildYamlSection, joinXmlSections } from "./prompt-xml";

type PromptProjectContext = RegisteredProjectDefinition & {
  activationTarget?: string;
  openspecRoot?: string;
};

function parseScopedAgent(agent: string | undefined): ProjectScopedAgentId | null {
  if (
    agent === "noctis" ||
    agent === "lunafreya" ||
    agent === "ignis" ||
    agent === "gladiolus" ||
    agent === "prompto" ||
    agent === "iris"
  ) {
    return agent;
  }

  return null;
}

function collectActiveProjects(
  appRoot: string,
  agent: string | undefined,
): { projects: PromptProjectContext[]; scopeLabel: string } {
  const { projectScopes } = readScopedProjectsConfig(appRoot);
  const scopedAgent = parseScopedAgent(agent);

  let targetScopes: string[];
  let scopeLabel: string;

  if (scopedAgent) {
    const scope = getProjectScopeForAgent(scopedAgent);
    targetScopes = scope ? [scope] : [...PROJECT_SCOPES];
    scopeLabel = scope || "all";
  } else {
    targetScopes = [...PROJECT_SCOPES];
    scopeLabel = "all";
  }

  const seen = new Set<string>();
  const projects: PromptProjectContext[] = [];

  for (const scope of targetScopes) {
    const ids = projectScopes[scope as keyof typeof projectScopes]?.activeProjectIds ?? [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const def = readRegisteredProjectDefinition(appRoot, id);
      if (def) projects.push(def);
    }
  }

  return { projects, scopeLabel };
}

function remapInstructionFiles(
  project: RegisteredProjectDefinition,
  rootPathOverride?: string,
): RegisteredProjectDefinition["instructionFiles"] {
  if (!rootPathOverride || !project.rootPath) {
    return project.instructionFiles;
  }

  const projectPrefix = `${project.rootPath}/`;
  return project.instructionFiles.map((file) => {
    if (!file.path.startsWith(projectPrefix)) {
      return file;
    }

    return {
      ...file,
      path: `${rootPathOverride}/${file.path.slice(projectPrefix.length)}`,
    };
  });
}

function collectMissionProjects(
  appRoot: string,
  missionId: string,
): { projects: PromptProjectContext[]; scopeLabel: string } {
  const mission = getMission(missionId);
  if (!mission) {
    return { projects: [], scopeLabel: "mission" };
  }

  if (!mission.executionProjectId) {
    return { projects: [], scopeLabel: "mission" };
  }

  const executionProject = readRegisteredProjectDefinition(appRoot, mission.executionProjectId);
  if (!executionProject) {
    return { projects: [], scopeLabel: "mission" };
  }

  const executionRoot = mission.workspacePath?.trim() || executionProject.rootPath;
  const projects: PromptProjectContext[] = [
    {
      ...executionProject,
      rootPath: executionRoot,
      instructionFiles: remapInstructionFiles(executionProject, executionRoot),
      activationTarget: executionRoot,
      openspecRoot: executionRoot,
    },
  ];

  for (const projectId of mission.contextProjectIds) {
    if (projectId === mission.executionProjectId) {
      continue;
    }

    const contextProject = readRegisteredProjectDefinition(appRoot, projectId);
    if (!contextProject) {
      continue;
    }

    projects.push(contextProject);
  }

  return { projects, scopeLabel: "mission" };
}

export type BuildSharedPromptContextOptions = {
  agent?: string;
  allowedWorkers?: string[];
  appRoot: string;
  executionMode?: string;
  missionId?: string;
  sessionId: string;
};

export type SharedPromptContextBundle = {
  agentContext: string;
  suppressedContext: string | null;
};

function getInstructionFilePaths(project: PromptProjectContext): string[] {
  return project.instructionFiles
    .filter((file) => file.enabled && file.path && existsSync(file.path))
    .map((file) => file.path);
}

function appendInstructionFiles(lines: string[], instructionFiles: string[], indent = ""): void {
  if (instructionFiles.length === 0) {
    lines.push(`${indent}instruction_files: []`);
    return;
  }

  lines.push(`${indent}instruction_files:`);
  for (const filePath of instructionFiles) {
    lines.push(`${indent}  - ${filePath}`);
  }
}

function buildWorkspaceContext(projects: PromptProjectContext[]): string {
  if (projects.length === 0) {
    return buildYamlSection("workspace-context", "projects: []");
  }

  if (projects.length === 1) {
    const project = projects[0];
    const lines = [`project_root: ${project.rootPath}`];
    appendInstructionFiles(lines, getInstructionFilePaths(project));
    return buildYamlSection("workspace-context", lines.join("\n"));
  }

  const lines = ["projects:"];
  for (const project of projects) {
    lines.push(`  - id: ${project.id}`);
    lines.push(`    project_root: ${project.rootPath}`);
    appendInstructionFiles(lines, getInstructionFilePaths(project), "    ");
  }

  return buildYamlSection("workspace-context", lines.join("\n"));
}

function buildToolingContext(projects: PromptProjectContext[]): string | null {
  if (projects.length === 0) {
    return null;
  }

  const firstProject = projects[0];
  const lines = [
    firstProject.activationTarget
      ? `activate_project: ${firstProject.activationTarget}`
      : firstProject.serenaProject
        ? `serena_project: ${firstProject.serenaProject}`
        : `activate_project: ${firstProject.id}`,
    `openspec_root: ${firstProject.openspecRoot ?? firstProject.rootPath ?? "not set"}`,
  ];

  return buildYamlSection("tooling-context", lines.join("\n"));
}

function buildDelegationContext(allowedWorkers: string[] | undefined): string | null {
  if (!allowedWorkers) {
    return null;
  }

  const lines =
    allowedWorkers.length === 0
      ? ["allowed_workers: []"]
      : ["allowed_workers:", ...allowedWorkers.map((agentId) => `  - ${agentId}`)];

  return buildYamlSection("delegation-context", lines.join("\n"));
}

function buildSuppressedPromptContext(input: {
  executionMode?: string;
  missionId?: string;
  projects: PromptProjectContext[];
  scopeLabel: string;
  sessionId: string;
}): string | null {
  const { executionMode, missionId, projects, scopeLabel, sessionId } = input;
  const lines = [`session_id: ${sessionId}`];

  if (missionId) {
    lines.unshift(`mission_id: ${missionId}`);
  }

  if (executionMode) {
    lines.push(`execution_mode: ${executionMode}`);
  }

  lines.push(`project_scope: ${scopeLabel}`);

  if (projects.length > 0) {
    lines.push("active_projects:");
    for (const project of projects) {
      lines.push(`  - id: ${project.id}`);
      lines.push(`    root_path: ${project.rootPath}`);
    }

    const firstProject = projects[0];
    lines.push(`serena_on_success: write successful value back to projects/${firstProject.id}/project.yaml as serena_project`);
    lines.push(
      `openspec_cli_hint: cd ${firstProject.rootPath || "<root_path>"} && openspec ...`,
    );
  }

  return buildYamlSection("suppressed-metadata", lines.join("\n"));
}

export function buildSharedPromptContextBundle({
  agent,
  allowedWorkers,
  appRoot,
  executionMode,
  missionId,
  sessionId,
}: BuildSharedPromptContextOptions): SharedPromptContextBundle {
  const { projects, scopeLabel } = missionId
    ? collectMissionProjects(appRoot, missionId)
    : collectActiveProjects(appRoot, agent);

  return {
    agentContext: joinXmlSections([
      buildWorkspaceContext(projects),
      buildToolingContext(projects),
      buildDelegationContext(allowedWorkers),
    ]),
    suppressedContext: buildSuppressedPromptContext({
      executionMode,
      missionId,
      projects,
      scopeLabel,
      sessionId,
    }),
  };
}

export function buildSharedPromptContext({
  agent,
  allowedWorkers,
  appRoot,
  executionMode,
  missionId,
  sessionId,
}: BuildSharedPromptContextOptions): string {
  return buildSharedPromptContextBundle({
    agent,
    allowedWorkers,
    appRoot,
    executionMode,
    missionId,
    sessionId,
  }).agentContext;
}