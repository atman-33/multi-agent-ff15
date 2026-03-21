export type InternalContextViewModel = {
  raw: string;
  summary: string;
};

const INTERNAL_CONTEXT_BLOCK_REGEX = /<internal-context>([\s\S]*?)<\/internal-context>/;
const INTERNAL_CONTEXT_REMOVE_REGEX = /<internal-context>[\s\S]*?<\/internal-context>/g;
const INTERNAL_CONTEXT_SESSION_REGEX = /^session_id:\s*(.+)$/m;
const INTERNAL_CONTEXT_SCOPE_REGEX = /^project_scope:\s*(.+)$/m;
const INTERNAL_CONTEXT_PROJECT_ID_REGEX = /^\s*- id:\s*(.+)$/gm;

export function parseInternalContext(content: string): InternalContextViewModel | null {
  const match = content.match(INTERNAL_CONTEXT_BLOCK_REGEX);
  if (!match) {
    return null;
  }

  const raw = (match[1] ?? "").trim();
  if (!raw) {
    return {
      raw: "",
      summary: "Injected internal context",
    };
  }

  const sessionId = raw.match(INTERNAL_CONTEXT_SESSION_REGEX)?.[1]?.trim() ?? null;
  const projectScope = raw.match(INTERNAL_CONTEXT_SCOPE_REGEX)?.[1]?.trim() ?? null;
  const projectIds = Array.from(raw.matchAll(INTERNAL_CONTEXT_PROJECT_ID_REGEX))
    .map((matchItem) => matchItem[1]?.trim())
    .filter((value): value is string => Boolean(value));

  const summaryParts = [sessionId ? `Session ${sessionId}` : null, projectScope, projectIds[0] ?? null]
    .filter((value): value is string => Boolean(value));
  const extraProjectCount = Math.max(projectIds.length - 1, 0);

  return {
    raw,
    summary:
      summaryParts.length > 0
        ? `${summaryParts.join(" · ")}${extraProjectCount > 0 ? ` +${extraProjectCount}` : ""}`
        : "Injected internal context",
  };
}

export function removeInternalContext(content: string): string {
  return content.replace(INTERNAL_CONTEXT_REMOVE_REGEX, "").trim();
}