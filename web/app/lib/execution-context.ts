export const APP_ROOT_EXECUTION_PROJECT_ID = "app_root";
export const APP_ROOT_EXECUTION_PROJECT_LABEL = "App Root (multi-agent-ff15)";

export function normalizeExecutionProjectId(executionProjectId: unknown): string | undefined {
  if (typeof executionProjectId !== "string") {
    return undefined;
  }

  const normalized = executionProjectId.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeContextProjectIds(
  executionProjectId: string | undefined,
  contextProjectIds: unknown,
): string[] {
  if (!Array.isArray(contextProjectIds)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const projectId of contextProjectIds) {
    if (typeof projectId !== "string") {
      continue;
    }

    const trimmed = projectId.trim();
    if (trimmed.length === 0 || trimmed === executionProjectId || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}