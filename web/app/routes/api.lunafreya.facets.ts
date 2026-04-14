import { listLunafreyaFacetCatalogEntries } from "@/lib/lunafreya-facet-catalog.server";
import { readOperationLanguage } from "@/lib/operation-definition/language";
import type { Route } from "./+types/api.lunafreya.facets";

function listBuiltinLanguages(language: string): string[] {
  return language === "en" ? ["en"] : [language, "en"];
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  try {
    const url = new URL(request.url);
    const executionProjectId = url.searchParams.get("executionProjectId")?.trim() || undefined;
    const language = readOperationLanguage();
    const builtinLanguages = listBuiltinLanguages(language);

    return Response.json({
      jobs: listLunafreyaFacetCatalogEntries({
        kind: "job",
        builtinLanguages,
        executionProjectId,
      }),
      skills: listLunafreyaFacetCatalogEntries({
        kind: "skill",
        builtinLanguages,
        executionProjectId,
      }),
    });
  } catch {
    return Response.json({ jobs: [], skills: [] }, { status: 500 });
  }
};