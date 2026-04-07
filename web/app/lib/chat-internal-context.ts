export type InternalContextViewModel = {
  raw: string;
  summary: string;
};

const CONTEXT_BLOCK_REGEX = /<(workspace-context|tooling-context|delegation-context)[^>]*>[\s\S]*?<\/\1>/g;
const PROJECT_ROOT_REGEX = /^project_root:\s*(.+)$/m;
const SERENA_PROJECT_REGEX = /^(?:serena_project|activate_project):\s*(.+)$/m;
const ALLOWED_WORKER_REGEX = /^\s*-\s*(.+)$/gm;

function collectContextBlocks(content: string): string[] {
  return Array.from(content.matchAll(CONTEXT_BLOCK_REGEX)).map((match) => match[0]?.trim() ?? "").filter(Boolean);
}

export function parseInternalContext(content: string): InternalContextViewModel | null {
  const blocks = collectContextBlocks(content);
  if (blocks.length === 0) {
    return null;
  }

  const raw = blocks.join("\n\n");
  if (!raw) {
    return {
      raw: "",
      summary: "Injected context",
    };
  }

  const projectRoot = raw.match(PROJECT_ROOT_REGEX)?.[1]?.trim() ?? null;
  const serenaProject = raw.match(SERENA_PROJECT_REGEX)?.[1]?.trim() ?? null;
  const workers = Array.from(raw.matchAll(ALLOWED_WORKER_REGEX))
    .map((matchItem) => matchItem[1]?.trim())
    .filter((value): value is string => Boolean(value));

  const summaryParts = [
    projectRoot ? `Workspace ${projectRoot.split("/").filter(Boolean).at(-1) ?? projectRoot}` : null,
    serenaProject ? `Serena ${serenaProject}` : null,
    workers.length > 0 ? `${workers.length} workers` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    raw,
    summary: summaryParts.join(" · ") || "Injected context",
  };
}

export function removeInternalContext(content: string): string {
  return content.replace(CONTEXT_BLOCK_REGEX, "").trim();
}
