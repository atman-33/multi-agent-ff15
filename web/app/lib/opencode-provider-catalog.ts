import type { CatalogRefreshState } from "@/lib/oh-my-opencode-config";
import type { ModelSelection } from "@/lib/types/mission";

export type OpencodeProviderModel = {
  id: string;
  name: string;
};

export type OpencodeProvider = {
  id: string;
  name: string;
  models: Record<string, OpencodeProviderModel>;
};

export type OpencodeProvidersResponse = {
  providers: OpencodeProvider[];
  default: Record<string, string>;
  variantsByModel: Record<string, string[]>;
  catalog: {
    generatedAt: string | null;
    lastError: string | null;
    refreshState: CatalogRefreshState;
    stale: boolean;
  };
};

export type ModelCatalogItem = {
  modelID: string;
  modelName: string;
  providerID: string;
  providerName: string;
};

export function flattenProviderModels(providers: OpencodeProvider[]): ModelCatalogItem[] {
  return providers.flatMap((provider) =>
    Object.values(provider.models ?? {}).map((model) => ({
      providerID: provider.id,
      providerName: provider.name,
      modelID: model.id,
      modelName: model.name,
    }))
  );
}

export function findModelCatalogItem(
  modelItems: ModelCatalogItem[],
  selection: ModelSelection | null | undefined
): ModelCatalogItem | null {
  if (!selection) {
    return null;
  }

  return (
    modelItems.find(
      (item) =>
        item.providerID === selection.providerID && item.modelID === selection.modelID
    ) ?? null
  );
}