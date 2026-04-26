import type { OperationDefinition } from "@/lib/operation-definition/types";
import type { ProjectScope } from "@/lib/project-scopes";

export const STORAGE_KEY = "operations:drafts:v1";

export interface OperationsDraftRecord {
  id: string;
  sourceOperationRef: string | null;
  scope: ProjectScope;
  targetValue: string;
  updatedAt: string;
  operation: OperationDefinition;
}

function isOperationDefinition(value: unknown): value is OperationDefinition {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sourcePath === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.initial_step === "string" &&
    Array.isArray(candidate.steps)
  );
}

function isDraftRecord(value: unknown): value is OperationsDraftRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    (candidate.sourceOperationRef === null || typeof candidate.sourceOperationRef === "string") &&
    (candidate.scope === "noctis_team" || candidate.scope === "lunafreya") &&
    typeof candidate.targetValue === "string" &&
    typeof candidate.updatedAt === "string" &&
    isOperationDefinition(candidate.operation)
  );
}

function buildDraftSourceKey(
  draft: Pick<OperationsDraftRecord, "sourceOperationRef" | "scope" | "targetValue">,
): string {
  if (draft.sourceOperationRef) {
    return `source:${draft.sourceOperationRef}`;
  }

  return `new:${draft.scope}:${draft.targetValue}`;
}

export function loadOperationsDrafts(storage: Pick<Storage, "getItem">): OperationsDraftRecord[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isDraftRecord).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export function persistOperationsDrafts(
  storage: Pick<Storage, "setItem">,
  drafts: OperationsDraftRecord[],
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

export function replaceOperationsDraft(
  drafts: OperationsDraftRecord[],
  nextDraft: OperationsDraftRecord,
): OperationsDraftRecord[] {
  const nextKey = buildDraftSourceKey(nextDraft);
  return [nextDraft, ...drafts.filter((draft) => buildDraftSourceKey(draft) !== nextKey)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function removeOperationsDraft(
  drafts: OperationsDraftRecord[],
  draftId: string,
): OperationsDraftRecord[] {
  return drafts.filter((draft) => draft.id !== draftId);
}