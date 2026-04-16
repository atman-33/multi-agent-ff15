import type { OperationDefinition } from "@/lib/operation-definition/types";
import {
  planOperationStudioDraftApply,
} from "@/lib/operation-studio/draft-apply.server";
import { parseOperationStudioAuthoringTarget } from "@/lib/operation-studio/catalog.server";
import type { Route } from "./+types/api.operation-studio.plan";

type PlanRequestBody = {
  operation?: unknown;
  sourceOperationRef?: unknown;
  targetValue?: unknown;
};

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

  const body = (await request.json().catch(() => null)) as PlanRequestBody | null;
  if (!body || !isOperationDefinition(body.operation)) {
    return Response.json({ error: "Missing operation draft" }, { status: 400 });
  }

  try {
    const targetValue = typeof body.targetValue === "string" ? body.targetValue.trim() : "builtin";
    const plan = planOperationStudioDraftApply({
      operation: body.operation,
      sourceOperationRef:
        typeof body.sourceOperationRef === "string" && body.sourceOperationRef.trim().length > 0
          ? body.sourceOperationRef.trim()
          : undefined,
      target: parseOperationStudioAuthoringTarget(targetValue),
    });

    return Response.json(plan);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
};