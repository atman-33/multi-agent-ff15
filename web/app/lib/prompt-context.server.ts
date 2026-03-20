import {
  readRegisteredProjectDefinition,
  readScopedProjectsConfig,
} from "@/lib/project-config.server";
import {
  getProjectScopeForAgent,
  type ProjectScopedAgentId,
} from "@/lib/project-scopes";

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

type BuildInjectedPromptContextOptions = {
  agent?: string;
  appRoot: string;
  sessionId: string;
};

export function buildInjectedPromptContext({
  agent,
  appRoot,
  sessionId,
}: BuildInjectedPromptContextOptions): string {
  const lines = ["<internal-context>", `session_id: ${sessionId}`];
  const scopedAgent = parseScopedAgent(agent);

  if (!scopedAgent) {
    lines.push("</internal-context>");
    return lines.join("\n");
  }

  const projectScope = getProjectScopeForAgent(scopedAgent);
  if (!projectScope) {
    lines.push("</internal-context>");
    return lines.join("\n");
  }

  const { projectScopes } = readScopedProjectsConfig(appRoot);
  const activeProjectIds = projectScopes[projectScope].activeProjectIds;
  const projects = activeProjectIds
    .map((id) => readRegisteredProjectDefinition(appRoot, id))
    .filter((project): project is NonNullable<typeof project> => project !== null);

  lines.push(`project_scope: ${projectScope}`);
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