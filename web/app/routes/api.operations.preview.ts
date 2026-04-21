import { parseOperationsAuthoringTarget, resolveOperationsLunafreyaFacetCatalog } from "@/lib/operations/catalog.server";
import type { OperationDefinition } from "@/lib/operation-definition/types";
import { buildOperationsPreviewBundle } from "@/lib/operations/preview-engine.server";
import type { ProjectScope } from "@/lib/project-scopes";
import type { WorkerAgentId } from "@/lib/types/mission";
import type { Route } from "./+types/api.operations.preview";

type PreviewRequestBody = {
  scope?: unknown;
  selectedJobId?: unknown;
  selectedSkillIds?: unknown;
  source?:
    | { kind: "saved"; operationRef?: unknown }
    | { kind: "draft"; draftId?: unknown; operationRef?: unknown; operation?: unknown };
  taskInstruction?: unknown;
  targetValue?: unknown;
  userMessage?: unknown;
  previewAllowedWorkers?: unknown;
};

function isProjectScope(value: unknown): value is ProjectScope {
  return value === "noctis_team" || value === "lunafreya";
}

function isWorkerAgentId(value: unknown): value is WorkerAgentId {
  return value === "ignis" || value === "gladiolus" || value === "prompto";
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

export const action = async ({ request }: Route.ActionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = (await request.json().catch(() => null)) as PreviewRequestBody | null;
  const previewAllowedWorkers = Array.isArray(body?.previewAllowedWorkers)
    ? body.previewAllowedWorkers.filter(isWorkerAgentId)
    : undefined;
  const scope = isProjectScope(body?.scope) ? body.scope : "noctis_team";
  const targetValue = typeof body?.targetValue === "string" ? body.targetValue.trim() : "builtin";
  const lunafreyaFacets =
    scope === "lunafreya"
      ? resolveOperationsLunafreyaFacetCatalog({
          selectedJobId: typeof body?.selectedJobId === "string" ? body.selectedJobId.trim() : undefined,
          selectedSkillIds: Array.isArray(body?.selectedSkillIds)
            ? body.selectedSkillIds.filter((value): value is string => typeof value === "string")
            : [],
          target: parseOperationsAuthoringTarget(targetValue),
        })
      : null;

  if (body?.source?.kind === "saved") {
    const operationRef = typeof body.source.operationRef === "string" ? body.source.operationRef.trim() : "";
    if (!operationRef) {
      return Response.json({ error: "Missing saved operationRef" }, { status: 400 });
    }

    return Response.json(
      buildOperationsPreviewBundle({
        source: {
          kind: "saved",
          operationRef,
        },
        ...(lunafreyaFacets ? { lunafreyaPromptExtension: lunafreyaFacets.promptExtension } : {}),
        ...(typeof body.userMessage === "string" ? { userMessage: body.userMessage } : {}),
        ...(typeof body.taskInstruction === "string" ? { taskInstruction: body.taskInstruction } : {}),
        ...(previewAllowedWorkers ? { previewAllowedWorkers } : {}),
      }),
    );
  }

  if (body?.source?.kind === "draft") {
    const draftId = typeof body.source.draftId === "string" ? body.source.draftId.trim() : "";
    if (!draftId || !isOperationDefinition(body.source.operation)) {
      return Response.json({ error: "Missing draft payload" }, { status: 400 });
    }

    return Response.json(
      buildOperationsPreviewBundle({
        source: {
          kind: "draft",
          draftId,
          operation: body.source.operation,
          ...(typeof body.source.operationRef === "string" && body.source.operationRef.trim()
            ? { operationRef: body.source.operationRef.trim() }
            : {}),
        },
        ...(lunafreyaFacets ? { lunafreyaPromptExtension: lunafreyaFacets.promptExtension } : {}),
        ...(typeof body.userMessage === "string" ? { userMessage: body.userMessage } : {}),
        ...(typeof body.taskInstruction === "string" ? { taskInstruction: body.taskInstruction } : {}),
        ...(previewAllowedWorkers ? { previewAllowedWorkers } : {}),
      }),
    );
  }

  return Response.json({ error: "Missing preview source" }, { status: 400 });
};