import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  RefreshCw,
  Terminal,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { readMcpConfig, type McpServerEntry } from "@/lib/mcp-config.server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { PageContainer } from "@/components/page-container";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/route";

interface McpConfigData {
  config: {
    mcp?: Record<string, McpServerEntry>;
  } | null;
  error?: string;
}

export const loader = async (_args: Route.LoaderArgs) => {
  const { config, error } = readMcpConfig();

  return {
    initialData: error ? null : ({ config } satisfies McpConfigData),
    initialFetchError: error ?? null,
  };
};

const McpPage = ({ loaderData }: Route.ComponentProps) => {
  const [data, setData] = useState<McpConfigData | null>(loaderData.initialData);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(loaderData.initialFetchError);
  const [savingNames, setSavingNames] = useState<Set<string>>(new Set());
  const [expandedNames, setExpandedNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    setData(loaderData.initialData);
    setFetchError(loaderData.initialFetchError);
  }, [loaderData.initialData, loaderData.initialFetchError]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/mcp-config");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json: McpConfigData = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }
      setData(json);
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggle = async (name: string, nextEnabled: boolean) => {
    if (!data?.config?.mcp) {
      return;
    }

    setData((prev) => {
      if (!prev?.config?.mcp) {
        return prev;
      }
      return {
        ...prev,
        config: {
          ...prev.config,
          mcp: {
            ...prev.config.mcp,
            [name]: { ...prev.config.mcp[name], enabled: nextEnabled },
          },
        },
      };
    });
    setSavingNames((prev) => new Set(prev).add(name));

    try {
      const res = await fetch("/api/mcp-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, enabled: nextEnabled }),
      });
      const result = await res.json();
      if (!res.ok) {
        setData((prev) => {
          if (!prev?.config?.mcp) {
            return prev;
          }
          return {
            ...prev,
            config: {
              ...prev.config,
              mcp: {
                ...prev.config.mcp,
                [name]: { ...prev.config.mcp[name], enabled: !nextEnabled },
              },
            },
          };
        });
        toast.error("Failed to save", { description: result.error });
        return;
      }
      toast.success(nextEnabled ? "MCP server enabled" : "MCP server disabled", {
        description: name,
      });
    } catch (e) {
      setData((prev) => {
        if (!prev?.config?.mcp) {
          return prev;
        }
        return {
          ...prev,
          config: {
            ...prev.config,
            mcp: {
              ...prev.config.mcp,
              [name]: { ...prev.config.mcp[name], enabled: !nextEnabled },
            },
          },
        };
      });
      toast.error("Failed to save", { description: String(e) });
    } finally {
      setSavingNames((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  };

  const toggleExpand = (name: string) => {
    setExpandedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const mcpEntries = Object.entries(data?.config?.mcp ?? {});
  const enabledCount = mcpEntries.filter(([, value]) => value.enabled).length;

  return (
    <PageContainer className="space-y-5" size="narrow">
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-muted-foreground text-sm">
            Manage Model Context Protocol servers defined in{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
              opencode.json
            </code>
          </p>
        </div>

        <Button disabled={loading} onClick={fetchData} size="sm" title="Refresh" variant="outline">
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {fetchError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load MCP config</AlertTitle>
          <AlertDescription className="mt-1 flex items-center gap-3">
            <span className="flex-1">{fetchError}</span>
            <Button disabled={loading} onClick={fetchData} size="sm" variant="outline">
              <RefreshCw className={cn("mr-1 h-3 w-3", loading && "animate-spin")} />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {data && mcpEntries.length === 0 && (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <Cpu className="mx-auto h-9 w-9 text-muted-foreground/30" />
            <p className="font-medium text-muted-foreground text-sm">No MCP servers configured.</p>
            <p className="text-muted-foreground/60 text-xs">
              Add servers to the <code>mcp</code> section in <code>opencode.json</code>.
            </p>
          </CardContent>
        </Card>
      )}

      {mcpEntries.length > 0 && (
        <div className="space-y-2">
          {mcpEntries.map(([name, entry]) => {
            const isEnabled = entry.enabled ?? false;
            const isSaving = savingNames.has(name);
            const isExpanded = expandedNames.has(name);
            const hasDetails = (entry.command && entry.command.length > 0) || entry.url;

            return (
              <Card
                className={cn(
                  "overflow-hidden transition-all duration-150",
                  isEnabled ? "border-primary/40 bg-primary/5" : "border-border/60"
                )}
                key={name}
              >
                <CardContent className="flex items-center gap-4 px-4 py-3.5">
                  <div className="shrink-0">
                    {isEnabled ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">{name}</span>
                      {entry.type && (
                        <Badge className="px-1.5 py-0 text-[10px]" variant="secondary">
                          {entry.type}
                        </Badge>
                      )}
                      {!isEnabled && (
                        <Badge
                          className="border-border/40 bg-transparent px-1.5 py-0 text-[10px] text-muted-foreground/60"
                          variant="outline"
                        >
                          Disabled
                        </Badge>
                      )}
                      {isSaving && (
                        <Badge className="px-1.5 py-0 text-[10px]" variant="outline">
                          Saving...
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
                      {entry.command?.[0] ? (
                        <span className="inline-flex items-center gap-1">
                          <Terminal className="h-3.5 w-3.5" />
                          <span className="truncate">{entry.command[0]}</span>
                        </span>
                      ) : null}
                      {entry.url ? <span className="truncate">{entry.url}</span> : null}
                    </div>
                  </div>

                  {hasDetails ? (
                    <Button
                      aria-label={isExpanded ? `Collapse ${name}` : `Expand ${name}`}
                      className="h-8 w-8 shrink-0"
                      onClick={() => toggleExpand(name)}
                      size="icon"
                      variant="ghost"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  ) : null}

                  <Switch
                    checked={isEnabled}
                    disabled={isSaving}
                    onCheckedChange={(nextEnabled) => handleToggle(name, nextEnabled)}
                  />
                </CardContent>

                {isExpanded && hasDetails ? (
                  <div className="border-border/60 border-t bg-muted/30 px-4 py-3 text-xs">
                    <div className="space-y-2">
                      {entry.command && entry.command.length > 0 ? (
                        <div>
                          <div className="mb-1 font-medium text-foreground/80">Command</div>
                          <code className="block overflow-x-auto rounded bg-background px-2 py-1.5 font-mono text-[11px]">
                            {entry.command.join(" ")}
                          </code>
                        </div>
                      ) : null}

                      {entry.url ? (
                        <div>
                          <div className="mb-1 font-medium text-foreground/80">URL</div>
                          <code className="block overflow-x-auto rounded bg-background px-2 py-1.5 font-mono text-[11px]">
                            {entry.url}
                          </code>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {mcpEntries.length > 0 ? (
        <div className="text-muted-foreground text-xs">
          {enabledCount} of {mcpEntries.length} servers enabled
        </div>
      ) : null}
    </PageContainer>
  );
};

export default McpPage;
