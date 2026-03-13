import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Project Instruction Injection Plugin
 *
 * Automatically injects instruction file references from active external projects
 * into user messages via the chat.message hook. Injects file paths only (not content)
 * so agents read on demand.
 *
 * Config: config/current_projects.yaml → active project IDs
 * Data:   projects/<id>.yaml → per-project instruction file metadata
 * Log:    logs/project-instruction-injection.jsonl → audit trail
 */

// Marker to prevent duplicate injection
const INJECTION_MARKER = "<project-instruction-context>";
const INJECTION_MARKER_END = "</project-instruction-context>";

interface InstructionFile {
  type: string;
  path: string;
  exists: boolean;
  sha256: string;
  last_checked_at: string;
}

interface ProjectDefinition {
  id: string;
  name: string;
  root_path: string;
  serena_project?: string;
  instruction_files: InstructionFile[];
}

interface LogEntry {
  timestamp: string;
  session_id: string;
  agent_id: string;
  project_scope?: string;
  active_project_ids: string[];
  resolved_files: string[];
  result: "ok" | "skip" | "error";
  reason?: string;
}

const resolveProjectScope = (agentId: string): "noctis_team" | "lunafreya" | null => {
  if (agentId === "lunafreya") {
    return "lunafreya";
  }

  if (
    agentId === "noctis" ||
    agentId === "ignis" ||
    agentId === "gladiolus" ||
    agentId === "prompto"
  ) {
    return "noctis_team";
  }

  return null;
};

const ProjectInstructionInjection: Plugin = async ({ $ }) => {
  const agentId = process.env.AGENT_ID || "unknown";
  const sessionId = process.env.SESSION_ID || "unknown";

  // --- JSONL Logging Utility (Task 5.1) ---
  const appendLog = async (entry: LogEntry): Promise<void> => {
    try {
      const jsonLine = JSON.stringify(entry);
      await $`echo ${jsonLine} >> logs/project-instruction-injection.jsonl`.quiet();
    } catch {
      // Logging failure should never break the plugin
    }
  };

  // --- Plugin log utility ---
  const log = async (message: string): Promise<void> => {
    try {
      const timestamp = new Date().toISOString();
      await $`mkdir -p logs`.quiet();
      await $`echo "[${timestamp}] project-instruction-injection (${agentId}): ${message}" >> logs/project-instruction-injection.log`.quiet();
    } catch {}
  };

  const checkPython = async (): Promise<void> => {
    try {
      await $`python3 --version`.quiet();
    } catch (e) {
      const timestamp = new Date().toISOString();
      await $`mkdir -p logs`.quiet();
      await $`echo "[${timestamp}] project-instruction-injection (${agentId}): [ERROR] python3 not available: ${String(e)}" >> logs/project-instruction-injection.log`.quiet();
    }
  };

  // --- Load active project IDs from config (Task 4.3) ---
  const loadActiveProjectIds = async (
    projectScope: "noctis_team" | "lunafreya"
  ): Promise<string[]> => {
    try {
      const result = await $`python3 .opencode/lib/project_loader.py active-ids ${projectScope}`.quiet();
      return JSON.parse(result.text().trim()) as string[];
    } catch {
      return [];
    }
  };

  // --- Load project definition from projects/<id>.yaml (Task 4.4) ---
  const loadProjectDefinition = async (
    projectId: string
  ): Promise<ProjectDefinition | null> => {
    try {
      const result = await $`python3 .opencode/lib/project_loader.py project-def ${projectId}`.quiet();
      const parsed = JSON.parse(result.text().trim());
      return parsed as ProjectDefinition | null;
    } catch {
      return null;
    }
  };

  // --- Generate injection block (Task 4.5) ---
  const generateInjectionBlock = (
    projects: ProjectDefinition[],
    projectScope: "noctis_team" | "lunafreya"
  ): { block: string; resolvedFiles: string[] } => {
    const resolvedFiles: string[] = [];
    let activeProjectsYaml = "";

    for (const project of projects) {
      const existingFiles = (project.instruction_files || []).filter(
        (f) => f.exists
      );
      if (existingFiles.length === 0 && !project.root_path) continue;

      activeProjectsYaml += `  - id: ${project.id}\n`;
      activeProjectsYaml += `    root_path: ${project.root_path}\n`;

      if (existingFiles.length > 0) {
        activeProjectsYaml += `    instruction_files:\n`;
        for (const file of existingFiles) {
          activeProjectsYaml += `      - ${file.path}\n`;
          resolvedFiles.push(file.path);
        }
      } else {
        activeProjectsYaml += `    instruction_files: []\n`;
      }
    }

    // Serena activation: use first active project's serena_project field (or fallback hint)
    const firstProject = projects[0];

    const block = `${INJECTION_MARKER}
project_scope: ${projectScope}
active_projects:
${activeProjectsYaml}serena_activation:
  project_id: ${firstProject?.id ?? "none"}
  activate_project: ${firstProject?.serena_project ?? `not set — try in order: "${firstProject?.id}" → "${firstProject?.root_path}" → UNC path`}
  on_success: write successful value back to projects/${firstProject?.id ?? "<id>"}.yaml as serena_project
openspec_context:
  root: ${firstProject?.root_path ?? "not set"}
  instruction: "When running any openspec CLI command (new, status, list, instructions, archive, etc.), execute from this directory: cd ${firstProject?.root_path ?? "<root_path>"} && openspec ..."
policy: (1) Activate Serena MCP for the first active project using serena_activation above. (2) Read instruction files on demand before implementation. (3) Use openspec_context.root for all openspec CLI commands when an active project is set.
${INJECTION_MARKER_END}`;

    return { block, resolvedFiles };
  };

  await checkPython();
  await log("project-instruction-injection started");

  return {
    // --- Register chat.message hook (Task 4.2) ---
    "chat.message": async (input, output) => {
      try {
        await log("[TRIGGER] chat.message hook called");
        const projectScope = resolveProjectScope(agentId);

        if (projectScope === null) {
          await appendLog({
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            agent_id: agentId,
            active_project_ids: [],
            resolved_files: [],
            result: "skip",
            reason: "agent has no project scope",
          });
          return;
        }

        // --- Duplicate injection prevention (Task 4.7) ---
        const existingParts = output.parts || [];
        for (const part of existingParts) {
          const textContent = (part as { type?: string; text?: string }).text;
          if (textContent && textContent.includes(INJECTION_MARKER)) {
            // Already injected, skip
            await appendLog({
              timestamp: new Date().toISOString(),
              session_id: sessionId,
              agent_id: agentId,
              project_scope: projectScope,
              active_project_ids: [],
              resolved_files: [],
              result: "skip",
              reason: "duplicate injection detected",
            });
            return;
          }
        }

        // Load active projects
        const activeIds = await loadActiveProjectIds(projectScope);

        // No active projects → skip (Task 5.4)
        if (activeIds.length === 0) {
          await appendLog({
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            agent_id: agentId,
            project_scope: projectScope,
            active_project_ids: [],
            resolved_files: [],
            result: "skip",
            reason: "no active projects",
          });
          return;
        }

        // Load all project definitions
        const projects: ProjectDefinition[] = [];
        for (const id of activeIds) {
          const def = await loadProjectDefinition(id);
          if (def) {
            projects.push(def);
          }
        }

        if (projects.length === 0) {
          await appendLog({
            timestamp: new Date().toISOString(),
            session_id: sessionId,
            agent_id: agentId,
            project_scope: projectScope,
            active_project_ids: activeIds,
            resolved_files: [],
            result: "skip",
            reason: "no project definitions found",
          });
          return;
        }

        // Generate and inject block (Task 4.6)
        const { block, resolvedFiles } = generateInjectionBlock(
          projects,
          projectScope
        );

        output.parts.push({
          id: `injection-${Date.now()}`,
          sessionID: input.sessionID,
          messageID: input.messageID ?? "",
          type: "text" as const,
          text: block,
        } as unknown as (typeof output.parts)[0]);

        // Log success (Task 5.3)
        await appendLog({
          timestamp: new Date().toISOString(),
          session_id: sessionId,
          agent_id: agentId,
          project_scope: projectScope,
          active_project_ids: activeIds,
          resolved_files: resolvedFiles,
          result: "ok",
        });
      } catch (err) {
        // --- Graceful failure (Task 4.8 & Task 5.5) ---
        await appendLog({
          timestamp: new Date().toISOString(),
          session_id: sessionId,
          agent_id: agentId,
          project_scope: resolveProjectScope(agentId) ?? undefined,
          active_project_ids: [],
          resolved_files: [],
          result: "error",
          reason: err instanceof Error ? err.message : String(err),
        });
        // Continue without injection — do not throw
      }
    },
  };
};

export default ProjectInstructionInjection;
