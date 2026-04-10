import { readOperationLanguage } from "@/lib/operation-definition/language";
import {
  listOperationCatalogEntriesForScope,
} from "@/lib/operation-definition/operation-catalog";
import {
  compareOperationOptions,
  toOperationOption,
} from "@/lib/operation-presentation";
import { getProjectRoot } from "@/lib/get-project-root.server";
import type { Route } from "./+types/api.noctis.operations";

export const loader = async ({ request }: Route.LoaderArgs) => {
  try {
    const root = getProjectRoot();
    const language = readOperationLanguage();
    const url = new URL(request.url);
    const executionProjectId = url.searchParams.get("executionProjectId")?.trim() || undefined;
    const operations = listOperationCatalogEntriesForScope({
      root,
      scope: "noctis_team",
      projectFilterId: executionProjectId,
      builtinLanguages: language === "en" ? ["en"] : [language, "en"],
    })
      .map(toOperationOption)
      .sort(compareOperationOptions);
    return Response.json({ operations });
  } catch {
    return Response.json({ operations: [] }, { status: 500 });
  }
};