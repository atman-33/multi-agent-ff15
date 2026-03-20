import {
  AlertTriangle,
  Cpu,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Save,
  Search,
  UserCircle2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/route";

interface ModelEntry {
  model: string;
  variant?: string;
}

interface OhMyOpenCodeConfig {
  agents?: Record<string, ModelEntry>;
  categories?: Record<string, ModelEntry>;
}

interface OhMyOpenCodeData {
  config: OhMyOpenCodeConfig | null;
  error?: string;
  isInstalled: boolean;
  models: string[];
  version: string;
}

const LoadingGrid = () => {
  return (
    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
      {[...new Array(6)].map((_, index) => (
        <div
          className="flex animate-pulse items-center gap-3 rounded-md border border-border/10 bg-card/10 p-1.5 px-3"
          key={`skeleton-${index}`}
        >
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="flex-1" />
          <div className="h-7 w-[220px] rounded bg-muted sm:w-[280px] 2xl:w-[320px]" />
        </div>
      ))}
    </div>
  );
};

const OhMyOpenCodePage = (_props: Route.ComponentProps) => {
  const [data, setData] = useState<OhMyOpenCodeData | null>(null);
  const [config, setConfig] = useState<OhMyOpenCodeConfig>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const res = await fetch("/api/oh-my-opencode/config");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const result: OhMyOpenCodeData = await res.json();
      setData(result);
      setConfig(result.config ?? {});
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleModelChange = (type: "agents" | "categories", key: string, model: string) => {
    setConfig((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [key]: {
          ...prev[type]?.[key],
          model,
        },
      },
    }));
  };

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

  if (loading && !data) {
    return (
      <div className="flex min-h-[300px] items-center justify-center p-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <div className="mx-auto flex h-full min-h-0 max-w-[1600px] flex-col gap-4 p-4">
      <div className="flex items-center justify-between border-border/50 border-b pb-2">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Cpu className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">OMO Config</h1>
            <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
              Configuration v{data?.version ?? "unknown"}
            </p>
          </div>
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

      {data && !data.isInstalled && (
        <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <div className="max-w-md">
            <h2 className="mb-2 font-bold text-xl">oh-my-opencode Not Found</h2>
            <p className="text-muted-foreground text-sm">
              It seems <code>oh-my-opencode</code> is not installed or not in your PATH.
              Install it to use this configuration page.
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
              className="h-9 w-full rounded-lg border border-border/50 bg-muted/20 px-3 pl-10 text-sm ring-1 ring-border/50 transition-all placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
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
                    <div
                      className="flex items-center gap-3 rounded-md border border-border/40 bg-card/30 px-3 py-2"
                      key={key}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-sm">{key}</div>
                        {entry.variant ? (
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {entry.variant}
                          </div>
                        ) : null}
                      </div>
                      <Select
                        onValueChange={(value) => handleModelChange("agents", key, value)}
                        value={entry.model}
                      >
                        <SelectTrigger className="w-[220px] sm:w-[280px] 2xl:w-[320px]">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          {data.models.map((model) => (
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                    <div
                      className="flex items-center gap-3 rounded-md border border-border/40 bg-card/30 px-3 py-2"
                      key={key}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-sm">{key}</div>
                        {entry.variant ? (
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {entry.variant}
                          </div>
                        ) : null}
                      </div>
                      <Select
                        onValueChange={(value) => handleModelChange("categories", key, value)}
                        value={entry.model}
                      >
                        <SelectTrigger className="w-[220px] sm:w-[280px] 2xl:w-[320px]">
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent>
                          {data.models.map((model) => (
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
      </div>
    </div>
  );
};

export default OhMyOpenCodePage;