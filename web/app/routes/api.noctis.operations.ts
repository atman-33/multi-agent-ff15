import { readOperationLanguage } from "@/lib/operation-definition/language";
import { listAvailableOperations } from "@/lib/operation-definition/operation-loader";
import { INTERNAL_AUTONOMOUS_OPERATION_NAME } from "@/lib/operation-runtime/autonomous";
import type { Route } from "./+types/api.noctis.operations";

export const loader = async (_args: Route.LoaderArgs) => {
  try {
    const operations = listAvailableOperations(readOperationLanguage())
      .filter((operationName) => operationName !== INTERNAL_AUTONOMOUS_OPERATION_NAME)
      .sort((left, right) => left.localeCompare(right));
    return Response.json({ operations });
  } catch {
    return Response.json({ operations: [] }, { status: 500 });
  }
};