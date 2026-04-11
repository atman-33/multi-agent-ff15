import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  APP_ROOT_EXECUTION_PROJECT_ID,
  APP_ROOT_EXECUTION_PROJECT_LABEL,
} from "@/lib/execution-context";
import {
  type RegisteredProjectDefinition,
  readRegisteredProjectDefinition,
  readRegisteredProjects,
} from "@/lib/project-config.server";

function createAppRootProjectDefinition(appRoot: string): RegisteredProjectDefinition {
  return {
    id: APP_ROOT_EXECUTION_PROJECT_ID,
    name: APP_ROOT_EXECUTION_PROJECT_LABEL,
    rootPath: appRoot,
    serenaProject: "",
    instructionFiles: existsSync(join(appRoot, "AGENTS.md"))
      ? [{ path: join(appRoot, "AGENTS.md"), enabled: true }]
      : [],
  };
}

export function readExecutionContextProjectDefinition(
  appRoot: string,
  projectId: string,
  options?: { includeAppRoot?: boolean },
): RegisteredProjectDefinition | null {
  if (options?.includeAppRoot && projectId === APP_ROOT_EXECUTION_PROJECT_ID) {
    return createAppRootProjectDefinition(appRoot);
  }

  return readRegisteredProjectDefinition(appRoot, projectId);
}

export function readExecutionContextProjectEntries(
  appRoot: string,
  options?: { includeAppRoot?: boolean },
) {
  const projects = readRegisteredProjects(appRoot);
  if (!options?.includeAppRoot) {
    return projects;
  }

  return [
    {
      id: APP_ROOT_EXECUTION_PROJECT_ID,
      displayName: APP_ROOT_EXECUTION_PROJECT_LABEL,
      path: appRoot,
    },
    ...projects,
  ];
}