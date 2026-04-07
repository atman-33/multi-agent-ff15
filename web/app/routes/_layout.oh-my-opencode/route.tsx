import {
  AlertTriangle,
  LayoutGrid,
  RefreshCw,
  Save,
  Search,
  UserCircle2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CompactModelVariantPicker } from "@/components/compact-model-variant-picker";
import {
  readOhMyOpenCodeData,
} from "@/lib/oh-my-opencode-config.server";
import {
  getModelSelectionFromEntry,
  type OhMyOpenCodeConfig,
  type OhMyOpenCodeConfigSection,
  type OhMyOpenCodeData,
  updateConfigPickerSelection,
} from "@/lib/oh-my-opencode-config";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";
import { parseModelReference } from "@/lib/model-variant-selection";
import {
  findModelCatalogItem,
  flattenProviderModels,
  type ModelCatalogItem,
} from "@/lib/opencode-provider-catalog";
import type { ModelSelection } from "@/lib/types/mission";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/route";

const LOADING_CARD_KEYS = [
  "skeleton-config",
  "skeleton-models",
  "skeleton-agents",
  "skeleton-tools",
  "skeleton-commands",
  "skeleton-status",
] as const;

const LoadingGrid = () => {
  return (
    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
      {LOADING_CARD_KEYS.map((key) => (
        <div
          className="flex animate-pulse items-center gap-3 rounded-md border border-border/10 bg-card/10 p-1.5 px-3"
          key={key}
        >
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="flex-1" />
          <div className="h-7 w-55 rounded bg-muted sm:w-70 2xl:w-80" />
        </div>
      ))}
    </div>
  );
};

function buildFallbackModelItems(models: string[]): ModelCatalogItem[] {
  const seen = new Set<string>();

  return models.flatMap((modelReference) => {
    if (seen.has(modelReference)) {
      return [];
    }

    seen.add(modelReference);
    const parsed = parseModelReference(modelReference);
    if (!parsed) {
      return [];
    }

    return [
      {
        providerID: parsed.providerID,
        providerName: parsed.providerID,
        modelID: parsed.modelID,
        modelName: parsed.modelID,
      },
    ];
  });
}

function getModelSummaryLabel(
  modelItems: ModelCatalogItem[],
  selection: ModelSelection | null,
  fallbackModel: string
): string {
  const selectedItem = findModelCatalogItem(modelItems, selection);
  return selectedItem
    ? `${selectedItem.providerName} / ${selectedItem.modelName}`
    : fallbackModel;
}

export const loader = async (_args: Route.LoaderArgs) => readOhMyOpenCodeData();

function getCatalogStatusLabel(data: OhMyOpenCodeData): string {
  const generatedAt = data.catalog.generatedAt;

  switch (data.catalog.refreshState) {
    case "refreshing":
      return generatedAt ? `Catalog refreshing · last snapshot ${generatedAt}` : "Catalog refreshing";
    case "error":
      return generatedAt ? `Catalog stale · last snapshot ${generatedAt}` : "Catalog refresh failed";
    case "ready":
      return generatedAt ? `Catalog updated ${generatedAt}` : "Catalog ready";
    default:
      return "Catalog unavailable";
  }
}

export const OhMyOpenCodePage = ({ loaderData }: Route.ComponentProps) => {
  const [data, setData] = useState<OhMyOpenCodeData>(loaderData);
  const [config, setConfig] = useState<OhMyOpenCodeConfig>(loaderData.config ?? {});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    setData(loaderData);
    setConfig(loaderData.config ?? {});
  }, [loaderData]);

  const modelItems = useMemo<ModelCatalogItem[]>(() => {
    const providerItems = flattenProviderModels(data.providers ?? []);
    return providerItems.length > 0 ? providerItems : buildFallbackModelItems(data.models);
  }, [data.models, data.providers]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const res = await fetch("/api/oh-my-opencode/config?refresh=1");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const result: OhMyOpenCodeData = await res.json();
      setData(result);
      setConfig(result.config ?? {});

      if (result.catalog.lastError) {
        toast.error("Catalog refresh failed", { description: result.catalog.lastError });
      } else {
        toast.success("Catalog refreshed");
      }
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleModelSelectionChange = useCallback(
    (type: OhMyOpenCodeConfigSection, key: string, selection: ModelSelection) => {
      setConfig((prev) => updateConfigPickerSelection(prev, type, key, selection, data.variantsByModel));
    },
    [data.variantsByModel]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);

    try {
      const res = await fetch("/api/oh-my-opencode/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const result = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        throw new Error(result.error ?? `HTTP ${res.status}`);
      }

      toast.success("Configuration saved successfully");
      setData((prev) =>
        prev
          ? {
              ...prev,
              config,
              error: undefined,
            }
          : prev
      );
    } catch (e) {
      toast.error("Save failed", { description: String(e) });
    } finally {
      setSaving(false);
    }
  }, [config]);

  const filteredAgents = Object.entries(config.agents ?? {}).filter(([key]) =>
    key.toLowerCase().includes(search.toLowerCase())
  );
  const filteredCategories = Object.entries(config.categories ?? {}).filter(([key]) =>
    key.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageContainer className="gap-4 p-4" size="wide">
        <div className="flex items-center justify-between border-border/50 border-b pb-2">
          <div>
            <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
              Configuration v{data?.version ?? "unknown"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{getCatalogStatusLabel(data)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button disabled={loading} onClick={fetchData} size="sm" variant="outline">
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button disabled={saving || !data?.isInstalled} onClick={handleSave} size="sm">
              {saving ? (
                "Saving..."
              ) : (
                <>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>

        {fetchError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Failed to load oh-my-opencode settings</AlertTitle>
            <AlertDescription className="mt-1">{fetchError}</AlertDescription>
          </Alert>
        )}

        {data?.error && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Configuration warning</AlertTitle>
            <AlertDescription className="mt-1">{data.error}</AlertDescription>
          </Alert>
        )}

        {data.catalog.lastError && (
          <Alert variant={data.catalog.stale ? "default" : "destructive"}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Model catalog warning</AlertTitle>
            <AlertDescription className="mt-1">{data.catalog.lastError}</AlertDescription>
          </Alert>
        )}

        {data && !data.isInstalled && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="max-w-md">
              <h2 className="mb-2 font-bold text-xl">oh-my-opencode Not Found</h2>
              <p className="text-muted-foreground text-sm">
                It seems <code>oh-my-opencode</code> is not installed or not in your PATH. Install
                it to use this configuration page.
              </p>
            </div>
            <Button onClick={fetchData} size="sm" variant="outline">
              Retry Check
            </Button>
          </div>
        )}

        {data?.isInstalled && (
          <>
            <div className="group relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary" />
              <input
                className="h-9 w-full rounded-lg border border-border/50 bg-muted/20 px-3 pl-10 text-sm ring-1 ring-border/50 transition-all placeholder:text-muted-foreground/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/50"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter agents or categories..."
                value={search}
              />
            </div>

            {loading && (
              <div className="min-h-0 flex-1 overflow-auto">
                <div className="pointer-events-none space-y-4 opacity-50">
                  <LoadingGrid />
                </div>
              </div>
            )}

            {!loading && (
              <div className="min-h-0 flex-1">
                <div className="grid h-full min-h-0 grid-cols-1 gap-x-8 gap-y-4 xl:grid-cols-2">
                  <section className="flex min-h-0 flex-col gap-2 overflow-hidden">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2 pl-1 font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
                        <UserCircle2 className="h-3.5 w-3.5 text-primary/70" />
                        Agents
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        {filteredAgents.length} items
                      </span>
                    </div>

                    <div className="min-h-0 overflow-y-auto pr-1">
                      <div className="grid gap-1.5">
                        {filteredAgents.map(([key, entry]) => (
                          <div className="flex gap-3 rounded-md border border-border/40 bg-card/30 px-3 py-2" key={key}>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-sm">{key}</div>
                              {(() => {
                                const selectedModel = getModelSelectionFromEntry(entry);
                                const modelLabel = getModelSummaryLabel(modelItems, selectedModel, entry.model);

                                return (
                                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground uppercase tracking-wide">
                                    <span>Model: {modelLabel}</span>
                                    <span>Variant: {entry.variant ?? "auto"}</span>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="w-55 sm:w-70 2xl:w-80">
                              <CompactModelVariantPicker
                                ariaLabel={`Select model for ${key}`}
                                contentAlign="end"
                                emptyLabel="Select model"
                                modelItems={modelItems}
                                onSelect={(selection) => handleModelSelectionChange("agents", key, selection)}
                                selectedModel={getModelSelectionFromEntry(entry)}
                                showProviderName={false}
                                triggerClassName="h-9 w-full rounded-md border border-border/50 bg-background/60 px-2 text-xs text-foreground hover:bg-accent/60"
                                variantsByModel={data.variantsByModel}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="flex min-h-0 flex-col gap-2 overflow-hidden">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2 pl-1 font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
                        <LayoutGrid className="h-3.5 w-3.5 text-primary/70" />
                        Categories
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        {filteredCategories.length} items
                      </span>
                    </div>

                    <div className="min-h-0 overflow-y-auto pr-1">
                      <div className="grid gap-1.5">
                        {filteredCategories.map(([key, entry]) => (
                          <div className="flex gap-3 rounded-md border border-border/40 bg-card/30 px-3 py-2" key={key}>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-sm">{key}</div>
                              {(() => {
                                const selectedModel = getModelSelectionFromEntry(entry);
                                const modelLabel = getModelSummaryLabel(modelItems, selectedModel, entry.model);

                                return (
                                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground uppercase tracking-wide">
                                    <span>Model: {modelLabel}</span>
                                    <span>Variant: {entry.variant ?? "auto"}</span>
                                  </div>
                                );
                              })()}
                            </div>
                            <div className="w-55 sm:w-70 2xl:w-80">
                              <CompactModelVariantPicker
                                ariaLabel={`Select model for ${key}`}
                                contentAlign="end"
                                emptyLabel="Select model"
                                modelItems={modelItems}
                                onSelect={(selection) => handleModelSelectionChange("categories", key, selection)}
                                selectedModel={getModelSelectionFromEntry(entry)}
                                showProviderName={false}
                                triggerClassName="h-9 w-full rounded-md border border-border/50 bg-background/60 px-2 text-xs text-foreground hover:bg-accent/60"
                                variantsByModel={data.variantsByModel}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </>
        )}
    </PageContainer>
  );
};

export default OhMyOpenCodePage;
