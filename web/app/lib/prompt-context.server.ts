import {
  readRegisteredProjectDefinition,
  readScopedProjectsConfig,
  type RegisteredProjectDefinition,
} from "@/lib/project-config.server";
import {
  getProjectScopeForAgent,
  PROJECT_SCOPES,
  type ProjectScopedAgentId,
} from "@/lib/project-scopes";

function parseScopedAgent(agent: string | undefined): ProjectScopedAgentId | null {
  if (agent === "noctis-solo") {
    return "noctis";
  }

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
  agent: string | undefined
): { projects: RegisteredProjectDefinition[]; scopeLabel: string } {
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
  const projects: RegisteredProjectDefinition[] = [];

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

type BuildInjectedPromptContextOptions = {
  agent?: string;
  allowedWorkers?: string[];
  appRoot: string;
  executionMode?: string;
  missionId?: string;
  sessionId: string;
};

export function buildInjectedPromptContext({
  agent,
  allowedWorkers,
  appRoot,
  executionMode,
  missionId,
  sessionId,
}: BuildInjectedPromptContextOptions): string {
  const lines = ["<internal-context>"];
  if (missionId) {
    lines.push(`mission_id: ${missionId}`);
  }
  lines.push(`session_id: ${sessionId}`);
  if (executionMode) {
    lines.push(`execution_mode: ${executionMode}`);
  }
  if (allowedWorkers) {
    if (allowedWorkers.length === 0) {
      lines.push("allowed_workers: []");
    } else {
      lines.push("allowed_workers:");
      for (const agentId of allowedWorkers) {
        lines.push(`  - ${agentId}`);
      }
    }
  }
  const { projects, scopeLabel } = collectActiveProjects(appRoot, agent);

  lines.push(`project_scope: ${scopeLabel}`);
  lines.push("active_projects:");

  if (projects.length === 0) {
    lines.push("  []");
    lines.push("</internal-context>");
    return lines.join("\n");
  }

  for (const project of projects) {
    lines.push(`  - id: ${project.id}`);
    lines.push(`    root_path: ${project.rootPath}`);

    const existingFiles = project.instructionFiles.filter((file) => file.exists && file.path);
    if (existingFiles.length === 0) {
      lines.push("    instruction_files: []");
      continue;
    }

    lines.push("    instruction_files:");
    for (const file of existingFiles) {
      lines.push(`      - ${file.path}`);
    }
  }

  const firstProject = projects[0];
  lines.push("serena_activation:");
  lines.push(`  project_id: ${firstProject.id}`);
  lines.push(
    `  activate_project: ${
      firstProject.serenaProject ||
      `not set - try in order: \"${firstProject.id}\" -> \"${firstProject.rootPath}\" -> UNC path`
    }`
  );
  lines.push(
    `  on_success: write successful value back to projects/${firstProject.id}.yaml as serena_project`
  );
  lines.push("openspec_context:");
  lines.push(`  root: ${firstProject.rootPath || "not set"}`);
  lines.push(
    `  instruction: When running any openspec CLI command new status list instructions archive etc execute from this directory: cd ${firstProject.rootPath || "<root_path>"} && openspec ...`
  );
  lines.push(
    "policy: (1) Activate Serena MCP for the first active project using serena_activation above. (2) Read instruction files on demand before implementation. (3) Use openspec_context.root for all openspec CLI commands when an active project is set."
  );
  lines.push("</internal-context>");

  return lines.join("\n");
}
