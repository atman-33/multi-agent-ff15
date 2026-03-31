import { readOperationLanguage } from "@/lib/operation-definition/language";
import { listAvailableOperations } from "@/lib/operation-definition/operation-loader";
import type { Route } from "./+types/api.noctis.operations";

export const loader = async (_args: Route.LoaderArgs) => {
  try {
    const operations = listAvailableOperations(readOperationLanguage()).sort((left, right) =>
      left.localeCompare(right),
    );
    return Response.json({ operations });
  } catch {
    return Response.json({ operations: [] }, { status: 500 });
  }
};