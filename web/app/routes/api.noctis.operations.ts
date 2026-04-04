import { readOperationLanguage } from "@/lib/operation-definition/language";
import {
  listAvailableOperations,
  loadOperationByName,
} from "@/lib/operation-definition/operation-loader";
import {
  compareOperationOptions,
  toOperationOption,
} from "@/lib/operation-presentation";
import type { Route } from "./+types/api.noctis.operations";

export const loader = async (_args: Route.LoaderArgs) => {
  try {
    const language = readOperationLanguage();
    const operations = listAvailableOperations(language)
      .map((operationName) => loadOperationByName(operationName, language))
      .map(toOperationOption)
      .sort(compareOperationOptions);
    return Response.json({ operations });
  } catch {
    return Response.json({ operations: [] }, { status: 500 });
  }
};