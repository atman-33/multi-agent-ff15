import { readAppLanguage } from "@/lib/app-language.server";
import { listAvailableOperations } from "@/lib/operation-engine/operation-loader";
import type { Route } from "./+types/api.noctis.operations";

export const loader = async (_args: Route.LoaderArgs) => {
  try {
    const operations = listAvailableOperations(readAppLanguage()).sort((left, right) =>
      left.localeCompare(right),
    );
    return Response.json({ operations });
  } catch {
    return Response.json({ operations: [] }, { status: 500 });
  }
};