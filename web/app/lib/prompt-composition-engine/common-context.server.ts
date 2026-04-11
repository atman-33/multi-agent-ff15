import { existsSync } from "node:fs";
import { APP_ROOT_EXECUTION_PROJECT_ID } from "@/lib/execution-context";
import { readExecutionContextProjectDefinition } from "@/lib/execution-context.server";
import { normalizeMissionExecutionTargetMode } from "@/lib/mission-execution-target-mode";
import { getMission } from "@/lib/mission-store";
import {
  type RegisteredProjectDefinition,
  readRegisteredProjectDefinition,
} from "@/lib/project-config.server";
import { readSessionExecutionContext } from "@/lib/session-execution-context.server";
import { buildYamlSection, joinXmlSections } from "./prompt-xml";

type PromptProjectContext = RegisteredProjectDefinition & {
  activationTarget?: string;
  openspecRoot?: string;
};

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

  const executionTargetMode = normalizeMissionExecutionTargetMode(
    mission.executionTargetMode,
    mission.executionProjectId,
  );
  const executionRoot =
    executionTargetMode === "execution_project"
      ? executionProject.rootPath
      : mission.workspacePath?.trim() || executionProject.rootPath;
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

function collectSessionProjects(
  appRoot: string,
  sessionId: string,
): { projects: PromptProjectContext[]; scopeLabel: string } {
  const sessionContext = readSessionExecutionContext(sessionId);
  const executionProject = readExecutionContextProjectDefinition(
    appRoot,
    sessionContext.executionProjectId,
    { includeAppRoot: true },
  );

  if (!executionProject) {
    return { projects: [], scopeLabel: "session" };
  }

  const projects: PromptProjectContext[] = [
    {
      ...executionProject,
      activationTarget:
        executionProject.id === APP_ROOT_EXECUTION_PROJECT_ID ? executionProject.rootPath : undefined,
      openspecRoot: executionProject.rootPath,
    },
  ];

  for (const projectId of sessionContext.contextProjectIds) {
    const contextProject = readExecutionContextProjectDefinition(appRoot, projectId, {
      includeAppRoot: true,
    });
    if (!contextProject || contextProject.id === executionProject.id) {
      continue;
    }

    projects.push(contextProject);
  }

  return { projects, scopeLabel: "session" };
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

  lines.push(`execution_context_scope: ${scopeLabel}`);

  const [executionProject, ...contextProjects] = projects;
  if (executionProject) {
    lines.push("execution_project:");
    lines.push(`  id: ${executionProject.id}`);
    lines.push(`  root_path: ${executionProject.rootPath}`);
  } else {
    lines.push("execution_project: null");
  }

  if (contextProjects.length === 0) {
    lines.push("context_projects: []");
  } else {
    lines.push("context_projects:");
    for (const project of contextProjects) {
      lines.push(`  - id: ${project.id}`);
      lines.push(`    root_path: ${project.rootPath}`);
    }
  }

  return buildYamlSection("suppressed-metadata", lines.join("\n"));
}

export function buildSharedPromptContextBundle({
  agent: _agent,
  allowedWorkers,
  appRoot,
  executionMode,
  missionId,
  sessionId,
}: BuildSharedPromptContextOptions): SharedPromptContextBundle {
  const { projects, scopeLabel } = missionId
    ? collectMissionProjects(appRoot, missionId)
    : collectSessionProjects(appRoot, sessionId);

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